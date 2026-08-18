import { describe, expect, it } from 'vitest';
import { FlagDisabledError, type FlagContext } from '@intafaced/config';
import { MemoryWaitlistStore } from './waitlist-store.js';
import { WaitlistError, WaitlistService } from './waitlist-service.js';

function flags(overrides: FlagContext['overrides'] = {}, drop: FlagContext['drop'] = '0'): FlagContext {
  return { drop, overrides };
}

function openService(): WaitlistService {
  return new WaitlistService(new MemoryWaitlistStore(), flags());
}

describe('WaitlistService — flag refuse-close', () => {
  it('enrolls at drop 0 when both flags follow the clock', async () => {
    const svc = openService();
    const out = await svc.enroll({ email: 'ada@example.com' });
    expect(out.created).toBe(true);
    expect(out.entry.position).toBe(1);
    expect(out.entry.referralCode).toMatch(/^[a-f0-9]{12}$/);
    expect(out.entry.referredBy).toBeNull();
  });

  it('refuses enroll when waitlist.enabled is overridden off — no row', async () => {
    const store = new MemoryWaitlistStore();
    const svc = new WaitlistService(store, flags({ 'waitlist.enabled': false }));
    await expect(svc.enroll({ email: 'ada@example.com' })).rejects.toBeInstanceOf(FlagDisabledError);
    try {
      await svc.enroll({ email: 'ada@example.com' });
      expect.unreachable('must refuse');
    } catch (err) {
      expect(err).toBeInstanceOf(FlagDisabledError);
      const e = err as FlagDisabledError;
      expect(e.code).toBe('flag.waitlist.enabled.disabled');
      expect(e.key).toBe('waitlist.enabled');
    }
    expect(await store.count()).toBe(0);
  });

  it('refuses enroll-with-code when referral.queue is pinned off — does not silent-drop the code', async () => {
    const store = new MemoryWaitlistStore();
    const open = new WaitlistService(store, flags());
    const referrer = await open.enroll({ email: 'ref@example.com' });

    const closed = new WaitlistService(store, flags({ 'referral.queue': false }));
    await expect(closed.enroll({ email: 'ada@example.com', referralCode: referrer.entry.referralCode })).rejects.toMatchObject({
      code: 'flag.referral.queue.disabled',
    });
    expect(await store.getByEmail('ada@example.com')).toBeNull();
    expect((await store.getByCode(referrer.entry.referralCode))?.referredCount).toBe(0);
  });

  it('still enrolls without a code when referral.queue is off', async () => {
    const svc = new WaitlistService(new MemoryWaitlistStore(), flags({ 'referral.queue': false }));
    const out = await svc.enroll({ email: 'ada@example.com' });
    expect(out.created).toBe(true);
    expect(out.entry.referredBy).toBeNull();
  });

  it('refuses position when referral.queue is off', async () => {
    const store = new MemoryWaitlistStore();
    const open = new WaitlistService(store, flags());
    const row = await open.enroll({ email: 'ada@example.com' });
    const closed = new WaitlistService(store, flags({ 'referral.queue': false }));
    await expect(closed.position(row.entry.referralCode)).rejects.toBeInstanceOf(FlagDisabledError);
  });

  it('refuses operator list when waitlist.enabled is off', async () => {
    const svc = new WaitlistService(new MemoryWaitlistStore(), flags({ 'waitlist.enabled': false }));
    await expect(svc.list({ limit: 10, offset: 0 })).rejects.toBeInstanceOf(FlagDisabledError);
  });
});

describe('WaitlistService — queue + referral attribution', () => {
  it('assigns FIFO positions and is idempotent on email', async () => {
    const svc = openService();
    const a = await svc.enroll({ email: 'Ada@example.com' });
    const b = await svc.enroll({ email: 'bob@example.com' });
    const again = await svc.enroll({ email: 'ada@example.com' });
    expect(a.entry.position).toBe(1);
    expect(b.entry.position).toBe(2);
    expect(again.created).toBe(false);
    expect(again.entry.referralCode).toBe(a.entry.referralCode);
    expect(again.entry.position).toBe(1);
  });

  it('records a referral without inventing a reward or moving position', async () => {
    const svc = openService();
    const ref = await svc.enroll({ email: 'ref@example.com' });
    const kid = await svc.enroll({ email: 'kid@example.com', referralCode: ref.entry.referralCode });
    expect(kid.created).toBe(true);
    expect(kid.entry.referredBy).toBe(ref.entry.referralCode);
    expect(kid.entry.position).toBe(2);

    const pos = await svc.position(ref.entry.referralCode);
    expect(pos.position).toBe(1);
    expect(pos.referredCount).toBe(1);
    expect(pos.queueLength).toBe(2);
  });

  it('refuses an unknown referral code — no silent enroll', async () => {
    const store = new MemoryWaitlistStore();
    const svc = new WaitlistService(store, flags());
    await expect(svc.enroll({ email: 'ada@example.com', referralCode: 'aaaaaaaaaaaa' })).rejects.toMatchObject({
      code: 'waitlist.unknown_referrer',
    });
    expect(await store.count()).toBe(0);
  });

  it('refuses a malformed referral code', async () => {
    const svc = openService();
    await expect(svc.enroll({ email: 'ada@example.com', referralCode: 'not-a-code' })).rejects.toBeInstanceOf(WaitlistError);
  });

  it('lists FIFO for the operator including email', async () => {
    const svc = openService();
    await svc.enroll({ email: 'a@example.com' });
    await svc.enroll({ email: 'b@example.com' });
    const list = await svc.list({ limit: 10, offset: 0 });
    expect(list.total).toBe(2);
    expect(list.entries.map((e) => e.email)).toEqual(['a@example.com', 'b@example.com']);
  });
});
