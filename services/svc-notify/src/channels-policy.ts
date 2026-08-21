/**
 * ops.notifications channels policy — fan-out mountain vs §13 sockets (D26-P1-O5).
 */
import {
  CHANNEL_TO_SOCKET,
  FANOUT_MOUNTAIN_ID,
  HONEST_GAPS,
  NOTIFY_CHANNEL_SOCKET_IDS,
  mountainDoneForbiddenWhileAllOutOfAppRefuse,
  mountainVsSocketsBoardCard,
  mountainVsSocketsExportText,
  mountainVsSocketsStatusLine,
} from './channels/mountain-vs-sockets.js';
import { OUT_OF_APP_CHANNELS } from './channels/channel.js';

export type ChannelsPolicySummary = ReturnType<typeof describeChannelsPolicy>;

/** Public honesty board for ops.notifications channel split. */
export function describeChannelsPolicy() {
  const card = mountainVsSocketsBoardCard();
  return {
    mountainId: FANOUT_MOUNTAIN_ID,
    outOfAppChannels: [...OUT_OF_APP_CHANNELS],
    socketIds: [...NOTIFY_CHANNEL_SOCKET_IDS],
    channelToSocket: { ...CHANNEL_TO_SOCKET },
    honestGaps: [...HONEST_GAPS],
    mountain: card,
    statusLine: mountainVsSocketsStatusLine(),
    export: mountainVsSocketsExportText(),
    matrixComplete: card.matrixComplete,
    inappHasNoSocket: card.inappHasNoSocket,
    mountainDoneForbiddenWhileAllOutOfAppRefuse: mountainDoneForbiddenWhileAllOutOfAppRefuse(true),
    inventsProviders: false as const,
    acceptedIsNotDelivered: true as const,
  };
}
