import { describe, expect, it } from 'vitest';
import { OUT_OF_APP_CHANNELS } from './channel.js';
import {
  CHANNEL_TO_SOCKET,
  FANOUT_MOUNTAIN_ID,
  HONEST_GAPS,
  NOTIFY_CHANNEL_SOCKET_IDS,
  channelForSocketId,
  channelSocketMatrixComplete,
  isDeclaredHonestGap,
  isNotifyChannelSocketId,
  mountainDoneForbiddenWhileAllOutOfAppRefuse,
  mountainVsSocketsBoardCard,
  mountainVsSocketsExportHeader,
  mountainVsSocketsExportLines,
  mountainVsSocketsExportText,
  mountainVsSocketsStatusLine,
  mountainVsSocketsStatusLineMatches,
  parseMountainVsSocketsStatusLine,
  socketIdForChannel,
} from './mountain-vs-sockets.js';

describe('D26-P1-O5 mountain vs §13 channel sockets', () => {
  it('names the fan-out mountain and three credential sockets', () => {
    expect(FANOUT_MOUNTAIN_ID).toBe('ops.notifications');
    expect(NOTIFY_CHANNEL_SOCKET_IDS).toEqual(['socket.notify-email', 'socket.notify-push', 'socket.notify-sms']);
    expect(channelSocketMatrixComplete()).toBe(true);
  });

  it('maps each out-of-app channel 1:1 onto a §13 socket; in-app has none', () => {
    expect(socketIdForChannel('inapp')).toBeNull();
    expect(socketIdForChannel('email')).toBe('socket.notify-email');
    expect(socketIdForChannel('push')).toBe('socket.notify-push');
    expect(socketIdForChannel('sms')).toBe('socket.notify-sms');
    for (const id of OUT_OF_APP_CHANNELS) {
      expect(channelForSocketId(CHANNEL_TO_SOCKET[id])).toBe(id);
    }
    expect(channelForSocketId('socket.invented')).toBeNull();
    expect(isNotifyChannelSocketId('socket.notify-email')).toBe(true);
    expect(isNotifyChannelSocketId('ops.notifications')).toBe(false);
  });

  it('forbids mountain done while every out-of-app channel refuses in deploy', () => {
    expect(mountainDoneForbiddenWhileAllOutOfAppRefuse(true)).toBe(true);
    expect(mountainDoneForbiddenWhileAllOutOfAppRefuse(false)).toBe(false);
  });

  it('names honest gaps without inventing providers', () => {
    expect(HONEST_GAPS).toContain('gap.class_x_credentials');
    expect(HONEST_GAPS).toContain('gap.no_provider_invent');
    expect(isDeclaredHonestGap('gap.accepted_is_not_delivered')).toBe(true);
    expect(isDeclaredHonestGap('gap.invent_twilio')).toBe(false);
  });

  it('boards and export stay consistent with the matrix', () => {
    const card = mountainVsSocketsBoardCard();
    expect(card.mountain).toBe('ops.notifications');
    expect(card.sockets).toBe(3);
    expect(card.outOfApp).toBe(3);
    expect(card.matrixComplete).toBe(true);
    expect(card.inappHasNoSocket).toBe(true);
    expect(mountainVsSocketsStatusLineMatches()).toBe(true);
    expect(parseMountainVsSocketsStatusLine(mountainVsSocketsStatusLine())?.mountain).toBe('ops.notifications');
    expect(parseMountainVsSocketsStatusLine('nope')).toBeNull();
    expect(mountainVsSocketsExportText().startsWith(mountainVsSocketsExportHeader())).toBe(true);
    expect(mountainVsSocketsExportLines()).toEqual([
      'inapp,mountain,',
      'email,socket,socket.notify-email',
      'push,socket,socket.notify-push',
      'sms,socket,socket.notify-sms',
    ]);
  });
});
