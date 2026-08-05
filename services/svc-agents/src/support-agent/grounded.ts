/**
 * Support agent Stage-2 — grounded desk plane (L3 pack).
 *
 * When KB is empty or ticket plane is dark, refuse invent answers.
 * Money tools remain banned by Stage-1 guardrail.
 */

export type SupportDeskPlane = 'live' | 'dark';

export type SupportGrounded =
  | {
      readonly status: 'ok';
      readonly plane: 'live';
      readonly allowedTasks: readonly ['support.classify', 'support.reply'];
    }
  | {
      readonly status: 'refuse';
      readonly plane: 'dark';
      readonly reason: 'desk_plane_dark' | 'kb_empty';
      readonly userMessageKey: 'agents.support.unavailable';
    };

export function supportGrounded(input: { plane: SupportDeskPlane; kbHitCount?: number; requireKb?: boolean }): SupportGrounded {
  if (input.plane === 'dark') {
    return {
      status: 'refuse',
      plane: 'dark',
      reason: 'desk_plane_dark',
      userMessageKey: 'agents.support.unavailable',
    };
  }
  if (input.requireKb && (input.kbHitCount ?? 0) <= 0) {
    return {
      status: 'refuse',
      plane: 'dark',
      reason: 'kb_empty',
      userMessageKey: 'agents.support.unavailable',
    };
  }
  return {
    status: 'ok',
    plane: 'live',
    allowedTasks: ['support.classify', 'support.reply'],
  };
}
