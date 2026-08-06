#!/usr/bin/env node
/**
 * Create JetStream streams CX-8 services need before boot.
 * Identity subscribes to blueprint events at start — stream must exist.
 */
import { connect } from 'nats';
import { ensureStream } from '@intafaced/events';

const NATS = process.env.NATS_URL ?? 'nats://127.0.0.1:4222';
const PREFIX = process.env.NATS_STREAM_PREFIX ?? 'CX8';
const MODULES = ['identity', 'ledger', 'matching', 'trade', 'blueprint', 'token'];

const nc = await connect({ servers: NATS, name: 'cx8-ensure-streams' });
const jsm = await nc.jetstreamManager();
for (const m of MODULES) {
  await ensureStream(jsm, m, PREFIX);
  console.log(`[cx8-streams] ok ${PREFIX}_${m.toUpperCase?.() || m}`);
}
await nc.close();
