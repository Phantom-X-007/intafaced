import { describe, expect, it } from 'vitest';
import {
  syncNavigatorSessionClosed,
  syncNavigatorSessionOpen,
  syncNavigatorSessionsClosedForUser,
} from './navigator-session-projection-sync.js';

describe('navigator session projection sync', () => {
  it('exports sync helpers without throwing when sql rejects', async () => {
    const sql = (() => {
      throw new Error('table missing');
    }) as unknown as Parameters<typeof syncNavigatorSessionOpen>[0];

    await expect(syncNavigatorSessionOpen(sql, 'sess-1', 'user-1')).resolves.toBeUndefined();
    await expect(syncNavigatorSessionClosed(sql, 'sess-1')).resolves.toBeUndefined();
    await expect(syncNavigatorSessionsClosedForUser(sql, 'user-1')).resolves.toBeUndefined();
  });
});
