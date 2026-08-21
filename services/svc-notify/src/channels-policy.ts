/**
 * ops.notifications channels policy — fan-out mountain vs §13 sockets (D26-P1-O5).
 */
import { FANOUT_MOUNTAIN_ID, HONEST_GAPS, NOTIFY_CHANNEL_SOCKET_IDS, mountainVsSocketsBoardCard } from './channels/mountain-vs-sockets.js';
import { OUT_OF_APP_CHANNELS } from './channels/channel.js';

export type ChannelsPolicySummary = ReturnType<typeof describeChannelsPolicy>;

/** Public honesty board for ops.notifications channel split. */
export function describeChannelsPolicy() {
  const card = mountainVsSocketsBoardCard();
  return {
    mountainId: FANOUT_MOUNTAIN_ID,
    outOfAppChannels: [...OUT_OF_APP_CHANNELS],
    socketIds: [...NOTIFY_CHANNEL_SOCKET_IDS],
    honestGaps: [...HONEST_GAPS],
    matrixComplete: card.matrixComplete,
    inappHasNoSocket: card.inappHasNoSocket,
    inventsProviders: false as const,
    acceptedIsNotDelivered: true as const,
  };
}
