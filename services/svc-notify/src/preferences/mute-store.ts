import type { Sql } from 'postgres';
import { applyMuteToggle, type ChannelMutePrefs, type MuteStore, type MuteableChannel } from './mute.js';

/**
 * Durable mute prefs — rows in `notify.channel_mutes`.
 *
 * Presence of `(user_id, channel)` means that channel is muted for non-critical
 * traffic. Critical fan-out still ignores mute in `dispatch.ts`; this store never
 * invents a critical mute flag.
 */

type MutePgRow = {
  channel: MuteableChannel;
};

export class PostgresMuteStore implements MuteStore {
  constructor(private readonly sql: Sql) {}

  async get(userId: string): Promise<ChannelMutePrefs> {
    const rows = await this.sql<MutePgRow[]>`
      SELECT channel FROM notify.channel_mutes
       WHERE user_id = ${userId}
    `;
    return { muted: new Set(rows.map((r) => r.channel)) };
  }

  async setMuted(userId: string, channel: MuteableChannel, muted: boolean): Promise<ChannelMutePrefs> {
    // Validate via the same pure toggle the memory store uses — refuse invalid
    // channel ids before touching SQL.
    const cur = await this.get(userId);
    applyMuteToggle(cur, { channel, muted });

    if (muted) {
      await this.sql`
        INSERT INTO notify.channel_mutes (user_id, channel)
        VALUES (${userId}, ${channel})
        ON CONFLICT (user_id, channel) DO NOTHING
      `;
    } else {
      await this.sql`
        DELETE FROM notify.channel_mutes
         WHERE user_id = ${userId} AND channel = ${channel}
      `;
    }

    return this.get(userId);
  }
}
