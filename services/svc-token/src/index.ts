import Fastify from 'fastify';
import postgres from 'postgres';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { TokenService } from './token-service.js';
import { DEFAULT_EMISSION_PARAMS } from './economics/emission.js';
import { DEFAULT_BUYBACK_PARAMS } from './economics/buyback.js';
import { createLedgerClient } from './ledger-client.js';

/**
 * svc-token — the native economy (§4.3).
 *
 * Third and last of the Phase 1 Core services. Owns the emission schedule, the
 * staking ladder, real-yield distribution, and buyback & burn.
 */

const sql = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? 'require' : false,
  connection: { search_path: 'token,public', application_name: env.SERVICE_NAME },
  onnotice: () => undefined,
});

await sql`SELECT 1 FROM token.token_params LIMIT 1`.catch(() => {
  throw new Error('token schema is missing — run migrations before starting svc-token');
});

const bus = await JetStreamEventBus.connect({
  servers: env.NATS_URL,
  producer: env.SERVICE_NAME,
  streamPrefix: env.NATS_STREAM_PREFIX,
  ownedStreams: ['token'],
});

// Value moves through svc-ledger, never through this service's own tables
// (Doctrine §0.6). This client is the only path.
const ledger = createLedgerClient(env.LEDGER_URL);

const token = new TokenService(sql, ledger, bus, {
  assetId: env.TOKEN_ASSET_ID,
  emission: DEFAULT_EMISSION_PARAMS,
  buyback: DEFAULT_BUYBACK_PARAMS,
});

const app = Fastify({ logger: { level: env.LOG_LEVEL } });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));
app.get('/ready', async () => ({ ready: true, emissionsEnabled: env.EMISSIONS_ENABLED }));

/**
 * The hot path other services call (§4.3): "other services call
 * token.stakeOf(userId) (cached) to gate launchpad allocations, OTC access,
 * premium lobbies, vendor slots".
 */
app.get<{ Params: { userId: string } }>('/internal/stake/:userId', async (req) => {
  const access = await token.accessOf(req.params.userId);
  return { staked: access.staked.toString(), tier: access.tier, feeDiscountBps: access.feeDiscountBps };
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT, asset: env.TOKEN_ASSET_ID, emissionsEnabled: env.EMISSIONS_ENABLED }, 'svc-token ready');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      await app.close();
      await bus.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
