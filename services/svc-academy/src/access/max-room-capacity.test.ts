/**
 * createRoom refuses unpublished ACADEMY_MAX_ROOM_CAPACITY.
 * Host-rights still gates first. Never invent 5000.
 */
import { describe, expect, it } from 'vitest';
import { BASE_PERKS } from '@intafaced/contracts';
import type { Sql } from 'postgres';
import { AcademyService } from '../academy-service.js';
import type { HostRightsSource } from '../host-rights.js';
import type { StakeSource } from '../stake-source.js';
import type { StreamProvider } from '../stream/provider.js';

const sqlNever = Object.assign(
  async () => {
    throw new Error('sql must not run when capacity is unpublished');
  },
  { begin: async () => undefined },
) as unknown as Sql;

const stakes: StakeSource = { stakeOf: async () => 0n };
const stream: StreamProvider = {
  id: 'none',
  openRoom: async () => '',
  credential: async () => ({ url: '', token: '', expiresAt: new Date(0) }),
  closeRoom: async () => undefined,
};
const hostOk: HostRightsSource = {
  perksOf: async () => ({ ...BASE_PERKS, lobbyHostRights: true }),
};
const hostNo: HostRightsSource = {
  perksOf: async () => ({ ...BASE_PERKS, lobbyHostRights: false }),
};

const room = {
  hostId: 'u-1',
  slug: 'desk',
  name: 'Desk',
  kind: 'general' as const,
  access: 'free' as const,
  capacity: 25,
};

describe('createRoom unpublished max room capacity', () => {
  it('refuses academy.room_capacity_unset when ceiling is blank', async () => {
    const academy = new AcademyService(sqlNever, stakes, hostOk, stream, {});
    await expect(academy.createRoom(room)).rejects.toMatchObject({ code: 'academy.room_capacity_unset' });
  });

  it('host-rights still gates first — no capacity sentence for a non-host', async () => {
    const academy = new AcademyService(sqlNever, stakes, hostNo, stream, {});
    await expect(academy.createRoom(room)).rejects.toMatchObject({ code: 'academy.host_rights_required' });
  });
});
