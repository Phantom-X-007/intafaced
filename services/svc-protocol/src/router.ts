import { z } from 'zod';
import { getAddress as toChecksum, isAddress } from 'viem';
import type { Address, Hex } from 'viem';
import { publicJurisdictionProcedure, publicProcedure, router, scopedProcedure, TRPCError } from '@intafaced/contracts';
import { computeAccountAddress, DEFAULT_USER_SALT, AddressDerivationError } from './accounts/address.js';
import { AccountRegistry, bindingMessage, ClaimRefusedError } from './accounts/registry.js';
import type { ProtocolChain } from './chain/client.js';
import { ChainUnavailableError, isZeroAddress } from './chain/availability.js';
import { RelayRefusedError, SessionRelay } from './session/relay.js';
import { createSessionSpec, evaluateSessionCall, hashSessionSpec, sessionSpecInputSchema, SessionScopeError } from './session/spec.js';
import type { UserOperation } from './chain/userop.js';
import { AmmMathError } from './amm/math.js';
import { buildCreatePool, buildMintLiquidity, buildSwapExactIn, quoteExactIn } from './amm/build.js';

/**
 * svc-protocol's API.
 *
 * Read the guards, not just the procedures. Almost everything here is
 * `publicJurisdictionProcedure` — no login, no KYC tier, no account gate. That
 * is §22 as code: this module is `custodial: false` on the `protocol` plane, so
 * `checkAccess` returns `allowed.permissionless` and there is nothing to verify,
 * because there is nothing held.
 *
 * The two authenticated procedures are the registry ones, and they are
 * authenticated for a mundane reason: attaching an address to an INTAFACED
 * profile requires knowing whose profile it is. They confer no power over the
 * account. `packages/auth` has no `protocol:write` scope at all — deliberately,
 * the same way it has no `ledger:write` — because no user token, and no
 * platform credential, may ever authorise anything on this plane. The only
 * thing that authorises here is a signature from the user's own key.
 */

const addressSchema = z
  .string()
  .refine((v) => isAddress(v, { strict: false }), { message: 'not an EVM address' })
  .transform((v) => toChecksum(v));

const bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'must be 32 bytes of hex');
const hexSchema = z.string().regex(/^0x[0-9a-fA-F]*$/, 'must be hex');

const userOperationSchema = z.object({
  sender: addressSchema,
  nonce: z.string().regex(/^\d+$/),
  factory: addressSchema.optional(),
  factoryData: hexSchema.optional(),
  callData: hexSchema,
  callGasLimit: z.string().regex(/^\d+$/),
  verificationGasLimit: z.string().regex(/^\d+$/),
  preVerificationGas: z.string().regex(/^\d+$/),
  maxFeePerGas: z.string().regex(/^\d+$/),
  maxPriorityFeePerGas: z.string().regex(/^\d+$/),
  paymaster: addressSchema.optional(),
  paymasterVerificationGasLimit: z.string().regex(/^\d+$/).optional(),
  paymasterPostOpGasLimit: z.string().regex(/^\d+$/).optional(),
  paymasterData: hexSchema.optional(),
  signature: hexSchema,
});

function toUserOperation(input: z.infer<typeof userOperationSchema>): UserOperation {
  return {
    sender: input.sender as Address,
    nonce: BigInt(input.nonce),
    ...(input.factory ? { factory: input.factory as Address } : {}),
    ...(input.factoryData ? { factoryData: input.factoryData as Hex } : {}),
    callData: input.callData as Hex,
    callGasLimit: BigInt(input.callGasLimit),
    verificationGasLimit: BigInt(input.verificationGasLimit),
    preVerificationGas: BigInt(input.preVerificationGas),
    maxFeePerGas: BigInt(input.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(input.maxPriorityFeePerGas),
    ...(input.paymaster ? { paymaster: input.paymaster as Address } : {}),
    ...(input.paymasterVerificationGasLimit ? { paymasterVerificationGasLimit: BigInt(input.paymasterVerificationGasLimit) } : {}),
    ...(input.paymasterPostOpGasLimit ? { paymasterPostOpGasLimit: BigInt(input.paymasterPostOpGasLimit) } : {}),
    ...(input.paymasterData ? { paymasterData: input.paymasterData as Hex } : {}),
    signature: input.signature as Hex,
  };
}

const unsignedCallOutput = z.object({
  to: z.string(),
  data: z.string(),
  /** Always "0" here. Nothing this service builds moves native value. */
  value: z.string(),
  summary: z.string(),
});

/** Refuse create2 arithmetic against an unconfigured factory/impl (defaults are 0x0). */
function requireAccountFactoryConfigured(factory: string, implementation: string): void {
  if (isZeroAddress(factory) || isZeroAddress(implementation)) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Smart account factory/implementation is not configured (PROTOCOL_FACTORY_ADDRESS / PROTOCOL_IMPLEMENTATION_ADDRESS).',
    });
  }
}

/** Every domain error becomes a client error with its own code intact. */
function toTrpcError(err: unknown): TRPCError {
  /**
   * A refusal that was already shaped stays shaped.
   *
   * Without this, any `TRPCError` thrown inside a procedure's own `try` block
   * falls all the way through to the `INTERNAL_SERVER_ERROR` at the bottom, and
   * a deliberate 400 arrives at the caller as "Protocol request failed" with its
   * message discarded.
   */
  if (err instanceof TRPCError) return err;
  /**
   * The chain being absent is not this service failing.
   *
   * 503 with the refusal code in the message, so a caller can tell "there is no
   * chain here" from "svc-protocol is broken". A 500 would invite a retry that
   * can never succeed, and — the reason this branch is first — anything falling
   * through to the bottom of this function becomes
   * `INTERNAL_SERVER_ERROR: 'Protocol request failed'`, which is precisely the
   * opaque answer a user cannot act on.
   */
  if (err instanceof ChainUnavailableError) {
    return new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: `${err.code}: ${err.message}`, cause: err });
  }
  if (err instanceof SessionScopeError) {
    return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }
  if (err instanceof ClaimRefusedError) {
    const code = err.code === 'registry.already_claimed' ? 'CONFLICT' : 'BAD_REQUEST';
    return new TRPCError({ code, message: err.message, cause: err });
  }
  if (err instanceof RelayRefusedError) {
    const code = err.code === 'relay.bundler_unavailable' ? 'PRECONDITION_FAILED' : 'BAD_REQUEST';
    return new TRPCError({ code, message: err.message, cause: err });
  }
  if (err instanceof AddressDerivationError) {
    return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }
  if (err instanceof AmmMathError) {
    return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Protocol request failed', cause: err });
}

export interface ProtocolRouterDeps {
  chain: ProtocolChain;
  registry: AccountRegistry;
  relay: SessionRelay;
  /** Mirrors the `protocol.smartAccounts` kill-switch (§14). */
  relayEnabled: () => boolean;
  /** Pool factory address on PROTOCOL_CHAIN_ID (0x0 = not deployed yet). */
  ammFactoryAddress: () => Address;
}

export function createProtocolRouter(deps: ProtocolRouterDeps) {
  const { chain, registry, relay } = deps;

  function requireRelayEnabled() {
    if (!deps.relayEnabled()) {
      // Note what a kill-switch can and cannot do here. It stops US from
      // relaying. It does not stop a user transacting: their account is on a
      // public chain and they can submit the same operation to any bundler.
      // A kill-switch on this plane is a switch on our convenience, never on
      // their access.
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Relaying is disabled. Your account is unaffected — submit directly to any bundler.',
      });
    }
  }

  return router({
    health: publicProcedure
      .output(
        z.object({
          ok: z.boolean(),
          service: z.literal('svc-protocol'),
          chainId: z.number(),
          custodial: z.literal(false),
          relayEnabled: z.boolean(),
          /** Both PROTOCOL_FACTORY_ADDRESS and PROTOCOL_IMPLEMENTATION_ADDRESS are non-zero. */
          factoryConfigured: z.boolean(),
        }),
      )
      .query(() => ({
        ok: true,
        service: 'svc-protocol' as const,
        chainId: chain.config.chainId,
        custodial: false as const,
        relayEnabled: deps.relayEnabled(),
        factoryConfigured: !isZeroAddress(chain.config.factory) && !isZeroAddress(chain.config.implementation),
      })),

    /**
     * IS ANY OF THIS REAL YET? — the question `health` cannot answer.
     *
     * `health` is deliberately synchronous: it reports config, touches no
     * network, and answers `ok: true` whenever the process is up. That is
     * correct for a liveness probe and misleading as a statement about the
     * chain, because `ok: true, chainId: 31337` reads as "there is a chain" when
     * `PROTOCOL_RPC_URL` defaults to a localhost port with nothing behind it.
     *
     * This procedure probes and reports what it found. It is the one place in
     * this router that returns a refusal as *data* rather than throwing it: a
     * product surface has to render "no chain configured" as a state, and a
     * status endpoint that 503s cannot be distinguished from one that is down.
     * Every other path here throws, because every other path would otherwise
     * have to invent a value.
     */
    chainStatus: publicJurisdictionProcedure('protocol', 'protocol')
      .output(
        z.object({
          reachable: z.boolean(),
          configuredChainId: z.number(),
          observedChainId: z.number().nullable(),
          blockNumber: z.string().nullable(),
          /** Factory AND implementation are both non-zero. */
          suiteDeployed: z.boolean(),
          refusalCode: z.string().nullable(),
          reason: z.string().nullable(),
          /** True only when a real chain answered AND the suite is deployed on it. */
          usable: z.boolean(),
        }),
      )
      .query(async () => {
        const status = await chain.status();
        return { ...status, usable: status.reachable && status.suiteDeployed };
      }),

    /**
     * The address a key will own, before anything is deployed. Permissionless:
     * this is arithmetic over public constants, and gating it would be theatre.
     * Refuses when factory/impl are still the zero-address defaults.
     */
    predictAddress: publicJurisdictionProcedure('protocol', 'protocol')
      .input(z.object({ owner: addressSchema, userSalt: bytes32Schema.default(DEFAULT_USER_SALT) }))
      .output(
        z.object({
          address: z.string(),
          chainId: z.number(),
          factory: z.string(),
          implementation: z.string(),
          deployed: z.boolean(),
        }),
      )
      .query(async ({ input }) => {
        requireAccountFactoryConfigured(chain.config.factory, chain.config.implementation);
        try {
          const address = computeAccountAddress({
            factory: chain.config.factory,
            implementation: chain.config.implementation,
            owner: input.owner as Address,
            userSalt: input.userSalt as Hex,
          });
          return {
            address,
            chainId: chain.config.chainId,
            factory: chain.config.factory,
            implementation: chain.config.implementation,
            deployed: await chain.isDeployed(address),
          };
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    /** Unsigned calldata for deployment. The user signs it; anyone may send it. */
    buildDeployment: publicJurisdictionProcedure('protocol', 'protocol')
      .input(z.object({ owner: addressSchema, userSalt: bytes32Schema.default(DEFAULT_USER_SALT) }))
      .output(unsignedCallOutput.extend({ predictedAddress: z.string() }))
      .query(({ input }) => {
        requireAccountFactoryConfigured(chain.config.factory, chain.config.implementation);
        const call = relay.buildDeployment(input.owner as Address, input.userSalt as Hex);
        return {
          to: call.to,
          data: call.data,
          value: call.value.toString(),
          summary: call.summary,
          predictedAddress: computeAccountAddress({
            factory: chain.config.factory,
            implementation: chain.config.implementation,
            owner: input.owner as Address,
            userSalt: input.userSalt as Hex,
          }),
        };
      }),

    /**
     * Validate a session scope and return the calldata that grants it.
     *
     * Nothing is granted here. A scope that the contract would refuse is
     * rejected before it ever becomes something to sign — including, always,
     * any scope carrying withdrawal power.
     */
    buildSessionGrant: publicJurisdictionProcedure('protocol', 'protocol')
      .input(z.object({ account: addressSchema, spec: sessionSpecInputSchema }))
      .output(unsignedCallOutput.extend({ specHash: z.string(), validUntil: z.number() }))
      .query(({ input }) => {
        try {
          const spec = createSessionSpec(input.spec, {
            account: input.account as Address,
            now: Math.floor(Date.now() / 1000),
          });
          const call = relay.buildSessionGrant(input.account as Address, spec);
          return {
            to: call.to,
            data: call.data,
            value: call.value.toString(),
            summary: call.summary,
            specHash: call.specHash,
            validUntil: spec.validUntil,
          };
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    buildSessionRevoke: publicJurisdictionProcedure('protocol', 'protocol')
      .input(z.object({ account: addressSchema, sessionKey: addressSchema }))
      .output(unsignedCallOutput)
      .query(({ input }) => {
        const call = relay.buildSessionRevoke(input.account as Address, input.sessionKey as Address);
        return { to: call.to, data: call.data, value: call.value.toString(), summary: call.summary };
      }),

    /** The panic button. One call, every session dead. Owner only, on chain. */
    buildRevokeAllSessions: publicJurisdictionProcedure('protocol', 'protocol')
      .input(z.object({ account: addressSchema }))
      .output(unsignedCallOutput)
      .query(({ input }) => {
        const call = relay.buildRevokeAllSessions(input.account as Address);
        return { to: call.to, data: call.data, value: call.value.toString(), summary: call.summary };
      }),

    /**
     * On-chain session state. The chain answers; we only relay the question.
     *
     * ── Why this reads the account's code first ──────────────────────────────
     *
     * `exists: false` is a claim about what the owner granted. It must only ever
     * be returned when a deployed account was actually asked and answered "no
     * session for that key". Two other situations produce the same *shape* and
     * mean something completely different:
     *
     *   · the account is not deployed — nobody has granted anything because
     *     there is nothing to grant on
     *   · the chain is unreachable — nobody looked
     *
     * Both of those now refuse. Reporting either as `exists: false, live: false`
     * would tell a user their agent's permissions are absent when the truth is
     * unknown, and a user who believes that will not go looking for the session
     * that is in fact live. `isDeployed` costs one `eth_getCode` and is what
     * makes the negative answer trustworthy.
     */
    sessionStatus: publicJurisdictionProcedure('protocol', 'protocol')
      .input(z.object({ account: addressSchema, sessionKey: addressSchema }))
      .output(
        z.object({
          exists: z.boolean(),
          live: z.boolean(),
          specHash: z.string().nullable(),
          validAfter: z.number().nullable(),
          validUntil: z.number().nullable(),
          /** Cumulative native value moved under this session, in wei. */
          spentWei: z.string().nullable(),
          revoked: z.boolean().nullable(),
        }),
      )
      .query(async ({ input }) => {
        try {
          const account = input.account as Address;

          if (!(await chain.isDeployed(account))) {
            throw new ChainUnavailableError(
              'protocol.contract_not_deployed',
              `${account} holds no contract code on chain ${chain.config.chainId}, so it has granted no sessions ` +
                `and cannot be asked about one. This is not the same as having no session.`,
            );
          }

          const record = await chain.sessionOf(account, input.sessionKey as Address);
          if (!record) {
            return {
              exists: false,
              live: false,
              specHash: null,
              validAfter: null,
              validUntil: null,
              spentWei: null,
              revoked: null,
            };
          }
          return {
            exists: true,
            live: await chain.isSessionLive(account, input.sessionKey as Address),
            specHash: record.specHash,
            validAfter: record.validAfter,
            validUntil: record.validUntil,
            spentWei: record.spentWei.toString(),
            revoked: record.revoked,
          };
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    /**
     * Would this call be allowed under this session? Answered without gas, by
     * the same rules the contract applies. Used by agents (§19) before acting.
     */
    checkSessionCall: publicJurisdictionProcedure('protocol', 'protocol')
      .input(
        z.object({
          account: addressSchema,
          spec: sessionSpecInputSchema,
          target: addressSchema,
          value: z.string().regex(/^\d+$/).default('0'),
          data: hexSchema,
          spentWei: z.string().regex(/^\d+$/).default('0'),
        }),
      )
      .output(z.object({ allowed: z.boolean(), code: z.string(), reason: z.string(), spentAfterWei: z.string() }))
      .query(({ input }) => {
        try {
          const now = Math.floor(Date.now() / 1000);
          const spec = createSessionSpec(input.spec, { account: input.account as Address, now });
          const decision = evaluateSessionCall({
            spec,
            account: input.account as Address,
            target: input.target as Address,
            value: BigInt(input.value),
            data: input.data as Hex,
            spentWei: BigInt(input.spentWei),
            now,
          });
          return { ...decision, spentAfterWei: decision.spentAfterWei.toString() };
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    /** The hash a user is really signing when they grant a session. */
    sessionSpecHash: publicJurisdictionProcedure('protocol', 'protocol')
      .input(z.object({ account: addressSchema, spec: sessionSpecInputSchema }))
      .output(z.object({ specHash: z.string() }))
      .query(({ input }) => {
        try {
          const spec = createSessionSpec(input.spec, {
            account: input.account as Address,
            now: Math.floor(Date.now() / 1000),
          });
          return { specHash: hashSessionSpec(spec) };
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    /**
     * Forward an operation the user already signed.
     *
     * `relay.submit` re-derives the operation hash and refuses anything whose
     * signature is not the owner's, or a live session key's. The service is a
     * courier here and the verification is what proves it.
     */
    relayUserOperation: publicJurisdictionProcedure('protocol', 'protocol')
      .input(z.object({ account: addressSchema, userOp: userOperationSchema }))
      .output(z.object({ userOpHash: z.string(), authority: z.enum(['owner', 'session']) }))
      .mutation(async ({ input }) => {
        requireRelayEnabled();
        try {
          return await relay.submit(toUserOperation(input.userOp), input.account as Address);
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    // ── Registry (a read model, not custody) ──────────────────────────────

    /** The message to sign to link an account. It authorises nothing. */
    bindingMessage: scopedProcedure('protocol:read', { module: 'protocol', plane: 'protocol' })
      .input(z.object({ address: addressSchema }))
      .output(z.object({ message: z.string() }))
      .query(({ ctx, input }) => ({
        message: bindingMessage({
          userId: ctx.principal.userId,
          chainId: chain.config.chainId,
          address: input.address as Address,
        }),
      })),

    claimAccount: scopedProcedure('protocol:read', { module: 'protocol', plane: 'protocol' })
      .input(
        z.object({
          owner: addressSchema,
          address: addressSchema,
          userSalt: bytes32Schema.default(DEFAULT_USER_SALT),
          signature: hexSchema,
        }),
      )
      .output(z.object({ id: z.string(), address: z.string(), owner: z.string(), deployed: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const record = await registry.claim({
            userId: ctx.principal.userId,
            owner: input.owner as Address,
            userSalt: input.userSalt as Hex,
            address: input.address as Address,
            signature: input.signature as Hex,
            deployed: await chain.isDeployed(input.address as Address),
          });
          return { id: record.id, address: record.address, owner: record.owner, deployed: record.deployed };
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    myAccounts: scopedProcedure('protocol:read', { module: 'protocol', plane: 'protocol' })
      .output(z.array(z.object({ id: z.string(), address: z.string(), owner: z.string(), deployed: z.boolean() })))
      .query(async ({ ctx }) => {
        const records = await registry.accountsOf(ctx.principal.userId);
        return records.map((r) => ({ id: r.id, address: r.address, owner: r.owner, deployed: r.deployed }));
      }),

    /**
     * AMM (`protocol.amm`) — constant-product pools on the Protocol Plane.
     *
     * Permissionless quotes and unsigned calldata only. The platform never
     * holds LP keys and never posts to the ledger here.
     */
    amm: router({
      /**
       * PURE MATH OVER RESERVES THE CALLER SUPPLIES. Not a market quote.
       *
       * Read the input list: `reserveIn` and `reserveOut` are parameters. This
       * procedure does not know which pool they came from, whether such a pool
       * exists, or how old they are. It is `getAmountOut` behind a network hop —
       * useful for a client that already holds a reserve snapshot and wants the
       * exact figure the contract would compute, and useless as a price.
       *
       * `quoteFromPool` is the one that sources its own reserves from the chain,
       * and it is what a product surface must call. This one is kept because a
       * caller that has reserves from elsewhere should not have to re-implement
       * the rounding — the whole point of mirroring
       * `ConstantProductPool._getAmountOut` is that there is exactly one
       * implementation of it.
       */
      quoteExactIn: publicJurisdictionProcedure('protocol', 'protocol')
        .input(
          z.object({
            amountIn: z.string().regex(/^\d+$/),
            reserveIn: z.string().regex(/^\d+$/),
            reserveOut: z.string().regex(/^\d+$/),
            feeBps: z.number().int().min(0).max(1000).default(30),
          }),
        )
        .output(
          z.object({
            amountOut: z.string(),
            priceImpactBps: z.number().int(),
            /** Always false here. The caller supplied the reserves; no chain was read. */
            reservesFromChain: z.literal(false),
          }),
        )
        .query(({ input }) => {
          try {
            const q = quoteExactIn({
              amountIn: BigInt(input.amountIn),
              reserveIn: BigInt(input.reserveIn),
              reserveOut: BigInt(input.reserveOut),
              feeBps: input.feeBps,
            });
            return { amountOut: q.amountOut.toString(), priceImpactBps: q.priceImpactBps, reservesFromChain: false as const };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /** Live reserves, oriented by the pool's own `token0`. Refuses if it cannot read them. */
      poolReserves: publicJurisdictionProcedure('protocol', 'protocol')
        .input(z.object({ pool: addressSchema }))
        .output(
          z.object({
            pool: z.string(),
            token0: z.string(),
            reserve0: z.string(),
            reserve1: z.string(),
            feeBps: z.number().int(),
            blockTimestampLast: z.number().int(),
          }),
        )
        .query(async ({ input }) => {
          try {
            const pool = input.pool as Address;
            const [reserves, token0, feeBps] = await Promise.all([
              chain.poolReserves(pool),
              chain.poolToken0(pool),
              chain.poolFeeBps(pool),
            ]);
            return {
              pool,
              token0,
              reserve0: reserves.reserve0.toString(),
              reserve1: reserves.reserve1.toString(),
              feeBps,
              blockTimestampLast: reserves.blockTimestampLast,
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /**
       * THE REAL QUOTE — reserves read from the pool, not accepted from the caller.
       *
       * This is the procedure that makes the AMM math reachable. It reads
       * `getReserves`, `token0` and `feeBps` from the pool, orients the reserves
       * against `tokenIn`, and applies the same `getAmountOut` the contract will.
       * Nothing is defaulted: if the chain cannot be read the call refuses with
       * `protocol.chain_unreachable`, and if the address holds no code it refuses
       * with `protocol.contract_not_deployed`.
       *
       * It refuses in this environment, every time, because there is no chain
       * (SOCKET §13 `socket.evm-rpc`). That is the honest state of
       * `protocol.amm` and it is why the tracker keeps it blocked.
       *
       * Two limits worth stating rather than discovering:
       *   · `blockTimestampLast` is the pool's own last-touch time, NOT the head
       *     block's. It cannot bound how stale this quote is. Measuring that
       *     needs the head block timestamp, which is a second read.
       *   · the three reads are concurrent but not atomic. `token0` and `feeBps`
       *     are immutable so they cannot skew; reserves are a single call, so a
       *     quote is consistent with one observation even though it is not
       *     pinned to a block. Pinning needs an explicit `blockNumber` argument.
       */
      quoteFromPool: publicJurisdictionProcedure('protocol', 'protocol')
        .input(
          z.object({
            pool: addressSchema,
            tokenIn: addressSchema,
            amountIn: z.string().regex(/^\d+$/),
          }),
        )
        .output(
          z.object({
            amountOut: z.string(),
            priceImpactBps: z.number().int(),
            reserveIn: z.string(),
            reserveOut: z.string(),
            feeBps: z.number().int(),
            /** Always true here — that is the difference from `quoteExactIn`. */
            reservesFromChain: z.literal(true),
            blockTimestampLast: z.number().int(),
          }),
        )
        .query(async ({ input }) => {
          try {
            const pool = input.pool as Address;
            const [reserves, token0, token1, feeBps] = await Promise.all([
              chain.poolReserves(pool),
              chain.poolToken0(pool),
              chain.poolToken1(pool),
              chain.poolFeeBps(pool),
            ]);

            /**
             * `token1` is read purely to make this check possible.
             *
             * Deciding orientation with a single `tokenIn === token0` test would
             * treat every unrecognised token as token1 and return a confident
             * quote for a pair the pool does not trade. That is a fabricated
             * price — the exact failure mode this whole surface refuses — so the
             * mismatch is named instead of defaulted.
             */
            const tokenIn = toChecksum(input.tokenIn);
            const inIsToken0 = tokenIn === toChecksum(token0);
            const inIsToken1 = tokenIn === toChecksum(token1);
            if (!inIsToken0 && !inIsToken1) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message:
                  `amm.token_not_in_pool: ${tokenIn} is not traded by pool ${pool}, which holds ` +
                  `${toChecksum(token0)} and ${toChecksum(token1)}. Refusing rather than quoting the wrong side.`,
              });
            }

            const reserveIn = inIsToken0 ? reserves.reserve0 : reserves.reserve1;
            const reserveOut = inIsToken0 ? reserves.reserve1 : reserves.reserve0;

            const q = quoteExactIn({ amountIn: BigInt(input.amountIn), reserveIn, reserveOut, feeBps });
            return {
              amountOut: q.amountOut.toString(),
              priceImpactBps: q.priceImpactBps,
              reserveIn: reserveIn.toString(),
              reserveOut: reserveOut.toString(),
              feeBps,
              reservesFromChain: true as const,
              blockTimestampLast: reserves.blockTimestampLast,
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      buildCreatePool: publicJurisdictionProcedure('protocol', 'protocol')
        .input(
          z.object({
            tokenA: addressSchema,
            tokenB: addressSchema,
            feeBps: z.number().int().min(0).max(1000).default(30),
          }),
        )
        .output(unsignedCallOutput)
        .query(({ input }) => {
          const factory = deps.ammFactoryAddress();
          if (isZeroAddress(factory)) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'AMM factory is not configured (PROTOCOL_AMM_FACTORY_ADDRESS). Contracts are in-repo under contracts/amm/.',
            });
          }
          const call = buildCreatePool(factory, input.tokenA as Address, input.tokenB as Address, input.feeBps);
          return { to: call.to, data: call.data, value: call.value, summary: call.summary };
        }),

      buildSwapExactIn: publicJurisdictionProcedure('protocol', 'protocol')
        .input(
          z.object({
            pool: addressSchema,
            tokenIn: addressSchema,
            amountIn: z.string().regex(/^\d+$/),
            minAmountOut: z.string().regex(/^\d+$/),
            to: addressSchema,
          }),
        )
        .output(unsignedCallOutput)
        .query(({ input }) => {
          const call = buildSwapExactIn(
            input.pool as Address,
            input.tokenIn as Address,
            BigInt(input.amountIn),
            BigInt(input.minAmountOut),
            input.to as Address,
          );
          return { to: call.to, data: call.data, value: call.value, summary: call.summary };
        }),

      buildMintLiquidity: publicJurisdictionProcedure('protocol', 'protocol')
        .input(
          z.object({
            pool: addressSchema,
            to: addressSchema,
            amount0Desired: z.string().regex(/^\d+$/),
            amount1Desired: z.string().regex(/^\d+$/),
          }),
        )
        .output(unsignedCallOutput)
        .query(({ input }) => {
          const call = buildMintLiquidity(
            input.pool as Address,
            input.to as Address,
            BigInt(input.amount0Desired),
            BigInt(input.amount1Desired),
          );
          return { to: call.to, data: call.data, value: call.value, summary: call.summary };
        }),
    }),
  });
}

export type ProtocolRouter = ReturnType<typeof createProtocolRouter>;
