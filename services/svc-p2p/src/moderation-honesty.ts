import { z } from 'zod';

/**
 * Health / open / backlog never probe a human moderator.
 *
 * `moderationReachable: allowlist.length > 0` sold `P2P_MODERATOR_USER_IDS`
 * as a live queue. Configured is not reachable. Process liveness stays
 * `ok: true`. Named ids are `configured` + `p2p.moderation_unprobed`.
 * An empty list is `absent` + `p2p.moderation_unreachable`.
 */
export const P2P_MODERATION_UNREACHABLE = 'p2p.moderation_unreachable' as const;
export const P2P_MODERATION_UNPROBED = 'p2p.moderation_unprobed' as const;

export const moderationHonestySchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('absent'),
    code: z.literal(P2P_MODERATION_UNREACHABLE),
  }),
  z.object({
    status: z.literal('configured'),
    code: z.literal(P2P_MODERATION_UNPROBED),
  }),
]);

export type ModerationHonesty = z.infer<typeof moderationHonestySchema>;

export function moderationHonesty(configured: boolean): ModerationHonesty {
  if (!configured) {
    return { status: 'absent', code: P2P_MODERATION_UNREACHABLE };
  }
  return { status: 'configured', code: P2P_MODERATION_UNPROBED };
}

/** Public pair: env allowlist vs the thing this process does not probe. */
export function moderationOnPublicDoor(configured: boolean): {
  moderationConfigured: boolean;
  moderation: ModerationHonesty;
} {
  return {
    moderationConfigured: configured,
    moderation: moderationHonesty(configured),
  };
}
