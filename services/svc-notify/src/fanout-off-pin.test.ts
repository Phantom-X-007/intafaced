/**
 * Unit card — fan-out kill leaves bus free to ack with no write
 * 1. Promise: README Kill-switches NOTIFY_FANOUT_ENABLED off → consumers ack,
 *    nothing written, nothing sent
 * 2. Break: fanout off still inserts inbox (blind users) or still dispatches
 * 3. Done bar: create returns inserted:false, null notification, null dispatch
 * 4. Class N
 * 5. Paths: svc-notify
 * 6. RED pin
 * 7. Collision: none
 */

import { describe, expect, it } from 'vitest';
import { NotifyService } from './notify-service.js';
import { MemoryNotifyStore } from './store.js';

describe('fan-out kill-switch — nothing written, nothing sent', () => {
  it('create is a pure no-op when fanoutEnabled is false', async () => {
    const store = new MemoryNotifyStore();
    const notify = new NotifyService(store, { fanoutEnabled: false });
    const result = await notify.create({
      userId: 'u1',
      kind: 'trade.fill',
      titleKey: 'notify.trade.fill.title',
      bodyKey: 'notify.trade.fill.body',
      params: {},
      severity: 'info',
      sourceSubject: 'intafaced.trade.fill.settled',
      sourceIdempotencyKey: 'fill-1',
    });
    expect(result).toEqual({ inserted: false, notification: null, dispatch: null });
    expect(await store.unreadCount('u1')).toBe(0);
  });
});
