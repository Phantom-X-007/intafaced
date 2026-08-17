/**
 * Unit card — add collateral through ledger-client; refuse missing loan / mark
 *
 * 1. Promise: loans.addCollateral posts recipes.loanCollateralLock. A missing
 *    loan refuses bank.loan_not_found. A missing mark refuses bank.mark_missing
 *    before any post. No invented rate. Amounts stay decimal strings.
 * 2. Break: a top-up against a guessed id or an unpriced book would lock
 *    collateral nobody can mark.
 * 3. Done bar: unknown loanId → NOT_FOUND / bank.loan_not_found; empty price
 *    source → PRECONDITION_FAILED / bank.mark_missing; no extra
 *    loan.collateral.locked. With a mark, HTTP /trpc/loans.addCollateral posts
 *    the lock.
 * 4. Class N
 * 5. Paths: services/svc-bank/src/loans/loan-service.ts, router.ts (addCollateral)
 * 6. RED: pin fails if addCollateral posts before this.loan() / marksFor
 * 7. Collision: #2194 compose quote-asset pin — this file does not touch
 *    compose, env.ts, or LOAN_QUOTE_ASSET_ID
 *
 * Tip re-attach: CI must run on this user commit, not the bot patch.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createTestDatabase, type TestDatabase } from '@intafaced/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { MemoryLedger, parseAmount as amt, recipes, userAvailable } from '@intafaced/ledger-client';
import { memoryLedgerHistory } from '../analytics/ledger-history.js';
import { createBankServices } from '../bank-service.js';
import { createBankRouter, type BankRouter } from '../router.js';
import { fixedPriceSource } from './prices.js';
import { DEFAULT_LIQUIDATION_POLICY } from './risk.js';

const SECRET = 'bank-loan-add-collateral-mark-secret-32b';
const BORROWER = '11111111-1111-4111-8111-111111111111';
const PAYER = '99999999-9999-4999-8999-999999999999';
const MISSING = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOW = new Date('2026-06-01T12:00:00.000Z');

const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const MIGRATIONS = readdirSync(drizzle)
  .filter((f) => f.endsIf('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));
