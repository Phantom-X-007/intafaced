import { describe, expect, it } from 'vitest';
import { supportGrounded } from './grounded.js';

describe('support agent Stage-2 grounded', () => {
  it('live allows classify/reply', () => {
    expect(supportGrounded({ plane: 'live' })).toEqual({
      status: 'ok',
      plane: 'live',
      allowedTasks: ['support.classify', 'support.reply'],
    });
  });

  it('dark desk refuses invent', () => {
    expect(supportGrounded({ plane: 'dark' }).status).toBe('refuse');
  });

  it('requireKb with zero hits refuses invent KB answers', () => {
    const r = supportGrounded({ plane: 'live', requireKb: true, kbHitCount: 0 });
    expect(r).toMatchObject({ status: 'refuse', reason: 'kb_empty' });
  });
});
