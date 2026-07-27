import type { FastifyInstance } from 'fastify';
import {
  formatAmount,
  parseAmount,
  accountRefSchema,
  postRequestSchema,
  InsufficientFundsError,
  LedgerError,
  UnbalancedTransactionError,
  InvalidEntryError,
  type EntryInput,
} from '@intafaced/ledger-client';
import { z } from 'zod';
import type { LedgerService } from './service.js';

/**
 * Plain S2S HTTP surface used by service ledger-clients.
 *
 * Bodies are raw JSON (not the tRPC envelope). Kept out of `index.ts` so the
 * DoD gate can require a real import from a test without booting Postgres.
 */

export function httpError(err: unknown): { status: number; body: { message: string } } {
  if (err instanceof InsufficientFundsError) return { status: 400, body: { message: err.message } };
  if (err instanceof UnbalancedTransactionError || err instanceof InvalidEntryError) {
    return { status: 500, body: { message: err.message } };
  }
  if (err instanceof LedgerError && err.code === 'ledger.frozen') {
    return { status: 412, body: { message: err.message } };
  }
  if (err instanceof LedgerError) return { status: 500, body: { message: err.message } };
  if (err instanceof z.ZodError) return { status: 400, body: { message: err.message } };
  return { status: 500, body: { message: 'Ledger request failed' } };
}

const balancesInput = z.object({
  ownerType: z.enum(['user', 'subaccount', 'module', 'house', 'treasury']),
  ownerId: z.string(),
});

export async function handleS2sPost(ledger: LedgerService, body: unknown) {
  const input = postRequestSchema.parse(body);
  const entries: EntryInput[] = input.entries.map((e) => ({
    account: e.account,
    direction: e.direction,
    amount: parseAmount(e.amount),
  }));
  const tx = await ledger.post({
    idempotencyKey: input.idempotencyKey,
    module: input.module,
    reason: input.reason,
    entries,
    ...(input.meta ? { meta: input.meta } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
  });
  return { txId: tx.id, hash: tx.hash, postedAt: tx.postedAt.toISOString() };
}

export async function handleS2sBalance(ledger: LedgerService, body: unknown) {
  const input = accountRefSchema.parse(body);
  const balance = await ledger.balance(input);
  return {
    accountId: balance.accountId,
    assetId: input.assetId,
    kind: input.kind,
    amount: formatAmount(balance.amount),
  };
}

export async function handleS2sBalances(ledger: LedgerService, body: unknown) {
  const input = balancesInput.parse(body);
  const balances = await ledger.balances(input.ownerType, input.ownerId);
  return balances.map((b) => ({
    accountId: b.accountId,
    assetId: b.account.assetId,
    kind: b.account.kind,
    amount: formatAmount(b.amount),
  }));
}

export function registerS2sHttp(app: FastifyInstance, ledger: LedgerService): void {
  app.post('/trpc/post', async (req, reply) => {
    try {
      return await handleS2sPost(ledger, req.body);
    } catch (err) {
      const { status, body } = httpError(err);
      return reply.code(status).send(body);
    }
  });

  app.post('/trpc/balance', async (req, reply) => {
    try {
      return await handleS2sBalance(ledger, req.body);
    } catch (err) {
      const { status, body } = httpError(err);
      return reply.code(status).send(body);
    }
  });

  app.post('/trpc/balances', async (req, reply) => {
    try {
      return await handleS2sBalances(ledger, req.body);
    } catch (err) {
      const { status, body } = httpError(err);
      return reply.code(status).send(body);
    }
  });
}
