import { createServer } from 'node:http';
import postgres from 'postgres';
import { createLedgerClient } from './ledger-client.js';
import { startMiningJobs } from './epoch-jobs.js';
import { parsePplnsBody, submitShare } from './submit-share.js';

const port = Number.parseInt(process.env.HTTP_PORT ?? '4023', 10);
const ledgerUrl = process.env.LEDGER_URL?.trim();
const internalSecret = process.env.INTERNAL_SERVICE_SECRET?.trim();
const databaseUrl = process.env.DATABASE_URL?.trim();
const ledger = ledgerUrl && internalSecret ? createLedgerClient(ledgerUrl, internalSecret) : null;
const sql = databaseUrl
  ? postgres(databaseUrl, {
      max: 8,
      connection: { search_path: 'mining_pool,public', application_name: 'svc-mining-pool' },
      onnotice: () => undefined,
    })
  : null;

function parsePayoutIntervalMs(raw: string | undefined): number | null {
  const trimmed = raw?.trim() ?? '';
  if (trimmed === '') return null;
  if (!/^[1-9][0-9]*$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

const intervalMs = parsePayoutIntervalMs(process.env.MINING_PAYOUT_INTERVAL_MS);
const jobs = sql && ledger && intervalMs != null ? startMiningJobs({ sql, ledger, intervalMs }) : null;

function json(response: import('node:http').ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function body(request: import('node:http').IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('mining.share_malformed');
  }
}

const server = createServer(async (request, response) => {
  if (request.url === '/health' || request.url === '/ready') {
    json(response, 200, {
      ok: true,
      service: 'svc-mining-pool',
      ledger: ledger ? 'wired' : 'unavailable',
      pg: sql ? 'wired' : 'unavailable',
      jobs: jobs ? jobs.host.list() : [],
    });
    return;
  }
  if (request.method === 'POST' && request.url === '/submitShare') {
    try {
      if (!sql) throw new Error('mining.pg_unavailable');
      const input = parsePplnsBody(await body(request));
      if (input.shares.length === 0) throw new Error('shares_empty');
      const plan = await submitShare(sql, input);
      json(response, 200, { accepted: true, settled: false, epoch: plan.windowId, payouts: plan.payouts, net: plan.net });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'mining.submitShare_failed';
      json(response, 409, { accepted: false, error: code });
    }
    return;
  }
  json(response, 404, { error: 'mining.route_unavailable' });
});

server.listen(port, '0.0.0.0');
