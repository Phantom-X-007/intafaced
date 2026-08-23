import { createServer } from 'node:http';
import { createLedgerClient } from './ledger-client.js';
import type { PplnsInput } from './pplns.js';
import { submitShare } from './submit-share.js';

const port = Number.parseInt(process.env.HTTP_PORT ?? '4023', 10);
const ledgerUrl = process.env.LEDGER_URL?.trim();
const internalSecret = process.env.INTERNAL_SERVICE_SECRET?.trim();
const ledger = ledgerUrl && internalSecret ? createLedgerClient(ledgerUrl, internalSecret) : null;

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
    json(response, 200, { ok: true, service: 'svc-mining-pool', ledger: ledger ? 'wired' : 'unavailable' });
    return;
  }
  if (request.method === 'POST' && request.url === '/submitShare') {
    try {
      if (!ledger) throw new Error('mining.ledger_unavailable');
      const input = (await body(request)) as PplnsInput;
      if (!Array.isArray(input.shares) || input.shares.length === 0) throw new Error('shares_empty');
      const plan = await submitShare(ledger, input);
      json(response, 200, { accepted: true, epoch: plan.windowId, payouts: plan.payouts, net: plan.net });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'mining.submitShare_failed';
      json(response, 409, { accepted: false, error: code });
    }
    return;
  }
  json(response, 404, { error: 'mining.route_unavailable' });
});

server.listen(port, '0.0.0.0');
