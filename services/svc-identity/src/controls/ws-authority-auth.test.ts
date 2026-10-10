import Fastify, { type FastifyRequest } from 'fastify';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { describe, expect, it } from 'vitest';
import { router, serviceProcedure, serviceAuthHeadersForBody, retainRawBody, currentAuthorityInputSchema } from '@intafaced/contracts';
import { createIdentityRequestContext } from './founder-context.js';
import { registerApiKeyOwnershipRoute } from '../auth/api-key-ownership-route.js';

const INTERNAL = 'synthetic-generic-identity-service-key-long-enough';
const WS = 'synthetic-private-read-identity-key-long-enough';
const TRADE = 'synthetic-trade-admission-identity-key-long-enough';
const USER = '11111111-1111-4111-8111-111111111111';
const KEY = '22222222-2222-4222-8222-222222222222';
const subject = { userId: USER, credential: { kind: 'api_key', apiKeyId: KEY } };

function fixture(privateAuthoritySecret = WS) {
  const config = {
    secret: 'synthetic-edge-principal-signing-key-long-enough',
    serviceName: 'svc-identity',
    internalSecret: INTERNAL,
    privateAuthoritySecret,
    operationAdmissionSecrets: { 'svc-trade': TRADE },
  };
  const createContext = createIdentityRequestContext(config);
  const routes = router({
    accountControls: router({
      currentAuthority: serviceProcedure.input(currentAuthorityInputSchema).mutation(({ input }) => input),
      operatorEntitlement: serviceProcedure.mutation(() => ({ changed: true })),
    }),
    arbitrary: router({ mutate: serviceProcedure.mutation(() => ({ changed: true })) }),
    operationAdmission: router({ decide: serviceProcedure.mutation(() => ({ changed: true })) }),
  });
  const app = Fastify();
  retainRawBody(app);
  registerApiKeyOwnershipRoute(app, {
    ...config,
    installRawBody: false,
    door: {
      async getApiKeyOwnership() {
        return { id: KEY, userId: USER, revoked: false, ipAllowlist: [], productScopes: [], originAllowlist: [], domainWhitelist: [] };
      },
    },
  });
  void app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: { router: routes, createContext: ({ req }: { req: FastifyRequest }) => createContext(req) },
  });
  return app;
}
function signed(secret: string, body: string, service = 'svc-ws') {
  return { 'content-type': 'application/json', ...serviceAuthHeadersForBody(service, secret, body) };
}

describe('private-stream read credential scope', () => {
  it('reads live authority and key policy with its dedicated key, while refusing generic WS signatures', async () => {
    const app = fixture();
    try {
      const payload = JSON.stringify(subject);
      for (const secret of [WS, INTERNAL]) {
        const response = await app.inject({
          method: 'POST',
          url: '/trpc/accountControls.currentAuthority',
          payload,
          headers: signed(secret, payload),
        });
        expect(response.statusCode).toBe(secret === WS ? 200 : 401);
        const metadata = await app.inject({ method: 'GET', url: `/internal/api-keys/${KEY}`, headers: signed(secret, '') });
        expect(metadata.statusCode).toBe(secret === WS ? 200 : 401);
      }
    } finally {
      await app.close();
    }
  });
  it('cannot use the read key for entitlement, arbitrary mutation, admission, or a mixed batch', async () => {
    const app = fixture();
    try {
      for (const path of [
        'accountControls.operatorEntitlement',
        'arbitrary.mutate',
        'operationAdmission.decide',
        'accountControls.currentAuthority,arbitrary.mutate?batch=1',
      ]) {
        const payload = JSON.stringify(path.includes('batch=1') ? { 0: subject, 1: {} } : {});
        const response = await app.inject({ method: 'POST', url: `/trpc/${path}`, payload, headers: signed(WS, payload) });
        expect(response.statusCode).toBe(401);
      }
    } finally {
      await app.close();
    }
  });
  it('rejects aliased read keys and other service names before returning either snapshot', async () => {
    for (const secret of [INTERNAL, TRADE]) {
      const app = fixture(secret);
      try {
        const payload = JSON.stringify(subject);
        expect(
          (await app.inject({ method: 'POST', url: '/trpc/accountControls.currentAuthority', payload, headers: signed(secret, payload) }))
            .statusCode,
        ).toBe(401);
        expect((await app.inject({ method: 'GET', url: `/internal/api-keys/${KEY}`, headers: signed(secret, '') })).statusCode).toBe(401);
        expect(
          (await app.inject({ method: 'GET', url: `/internal/api-keys/${KEY}`, headers: signed(WS, '', 'svc-trade') })).statusCode,
        ).toBe(401);
      } finally {
        await app.close();
      }
    }
  });
});
