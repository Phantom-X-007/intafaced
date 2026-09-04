import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TRPCError } from '@intafaced/contracts';
import type { AuthService } from './auth-service.js';
import type { FreezeService } from '../affiliates/freeze-service.js';
import { installFreezeDualControl, installPrivilegedDualControl, requirePrivilegedDualControl } from './privileged-dual-control.js';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const CONFIRM = '22222222-2222-4222-8222-222222222222';
const TARGET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const here = dirname(fileURLToPath(import.meta.url));

describe('privileged dual-control — freeze / KYC / affiliate freeze', () => {
  it('missing or same-actor confirm refuses', () => {
    expect(() => requirePrivilegedDualControl({ actorId: ACTOR })).toThrow(/dual-control/);
    expect(() => requirePrivilegedDualControl({ actorId: ACTOR, confirmActorId: ACTOR })).toThrow(/dual-control/);
    expect(() => requirePrivilegedDualControl({ actorId: ACTOR, confirmActorId: CONFIRM })).not.toThrow();
  });

  it('freezeIdentity / unfreezeIdentity without a second actor refuse and do not write', async () => {
    let frozen = 0;
    let thawed = 0;
    const auth = {
      async freezeIdentity(userId: string) {
        frozen += 1;
        return { userId, status: 'frozen' as const, subAccountsRevoked: 0, apiKeysRevoked: 0 };
      },
      async unfreezeIdentity(userId: string) {
        thawed += 1;
        return { userId, status: 'active' as const };
      },
      async approveKycRecord() {
        return { id: 'r' };
      },
      async rejectKycRecord() {
        return { id: 'r' };
      },
    };
    installPrivilegedDualControl(auth as unknown as AuthService);

    await expect(auth.freezeIdentity(TARGET)).rejects.toBeInstanceOf(TRPCError);
    await expect(auth.freezeIdentity(TARGET)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(auth.unfreezeIdentity(TARGET)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(frozen).toBe(0);
    expect(thawed).toBe(0);

    await expect(auth.freezeIdentity(TARGET, { actorId: ACTOR, confirmActorId: CONFIRM } as never)).resolves.toMatchObject({
      status: 'frozen',
    });
    await expect(auth.unfreezeIdentity(TARGET, { actorId: ACTOR, confirmActorId: CONFIRM } as never)).resolves.toMatchObject({
      status: 'active',
    });
    expect(frozen).toBe(1);
    expect(thawed).toBe(1);
  });

  it('KYC approve/reject with one reviewer refuse; two distinct actors apply', async () => {
    let approved = 0;
    let rejected = 0;
    const auth = {
      async freezeIdentity() {
        return { userId: TARGET, status: 'frozen' as const, subAccountsRevoked: 0, apiKeysRevoked: 0 };
      },
      async unfreezeIdentity() {
        return { userId: TARGET, status: 'active' as const };
      },
      async approveKycRecord() {
        approved += 1;
        return { id: 'rec' };
      },
      async rejectKycRecord() {
        rejected += 1;
        return { id: 'rec' };
      },
    };
    installPrivilegedDualControl(auth as unknown as AuthService);

    await expect(auth.approveKycRecord({ reviewerId: ACTOR } as never)).rejects.toBeInstanceOf(TRPCError);
    await expect(auth.rejectKycRecord({ reviewerId: ACTOR } as never)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(approved).toBe(0);
    expect(rejected).toBe(0);

    await expect(auth.approveKycRecord({ reviewerId: ACTOR, confirmActorId: CONFIRM } as never)).resolves.toMatchObject({ id: 'rec' });
    await expect(auth.rejectKycRecord({ reviewerId: ACTOR, confirmActorId: CONFIRM } as never)).resolves.toMatchObject({ id: 'rec' });
    expect(approved).toBe(1);
    expect(rejected).toBe(1);
  });

  it('affiliate freeze/unfreeze without confirm refuse and do not write', async () => {
    let writes = 0;
    const freeze = {
      async freeze(input: { beneficiaryId: string; frozenBy: string; reason: string }) {
        writes += 1;
        return { ...input, frozenAt: new Date('2026-09-04T00:00:00.000Z') };
      },
      async unfreeze(beneficiaryId: string) {
        writes += 1;
        return {
          beneficiaryId,
          frozenBy: ACTOR,
          reason: 'was-frozen',
          frozenAt: new Date('2026-09-04T00:00:00.000Z'),
        };
      },
    };
    installFreezeDualControl(freeze as unknown as FreezeService);

    await expect(freeze.freeze({ beneficiaryId: TARGET, frozenBy: ACTOR, reason: 'risk' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    await expect(freeze.unfreeze(TARGET)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(writes).toBe(0);

    await expect(
      freeze.freeze({
        beneficiaryId: TARGET,
        frozenBy: ACTOR,
        reason: 'risk',
        confirmActorId: CONFIRM,
      } as never),
    ).resolves.toMatchObject({ beneficiaryId: TARGET });
    await expect(freeze.unfreeze(TARGET, { actorId: ACTOR, confirmActorId: CONFIRM })).resolves.toMatchObject({ beneficiaryId: TARGET });
    expect(writes).toBe(2);
  });

  it('boot path installs the hitch; disable-user door names a second actor', () => {
    const indexSrc = readFileSync(join(here, '../index.ts'), 'utf8');
    expect(indexSrc).toMatch(/installPrivilegedDualControl\(auth\)/);
    expect(indexSrc).toMatch(/installFreezeDualControl\(freeze\)/);

    const door = readFileSync(join(here, '../disable-user-router.ts'), 'utf8');
    expect(door).toMatch(/confirmActorId/);
    expect(door).toMatch(/ctx\.principal\.userId/);
    expect(door).toMatch(/PRECONDITION_FAILED/);
    expect(door).toMatch(/DUAL_CONTROL_MISSING/);
  });
});
