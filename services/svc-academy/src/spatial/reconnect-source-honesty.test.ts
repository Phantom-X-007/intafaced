import { describe, expect, it } from 'vitest';
import {
  reconnectCatalogBoardCard,
  reconnectCatalogStatusLine,
  parseReconnectCatalogStatusLine,
  reconnectCatalogStatusLineMatches,
  reconnectCatalogStatusLineConsistent,
  reconnectResultBoardCard,
  reconnectResultStatusLine,
  parseReconnectResultStatusLine,
  reconnectResultStatusLineMatches,
  reconnectResultStatusLineConsistent,
  reconnectResultExportHeader,
  reconnectResultExportLine,
  reconnectResultExportText,
  isDeclaredReconnectSource,
  isDeclaredReconnectRefuseReason,
  RECONNECT_OK_SOURCES,
  RECONNECT_REFUSE_REASONS,
  type ReconnectBoardInput,
} from './reconnect-source-honesty.js';

describe('L3 wave141 reconnect source honesty', () => {
  it('catalog and result boards', () => {
    expect(RECONNECT_OK_SOURCES).toHaveLength(3);
    expect(RECONNECT_REFUSE_REASONS).toHaveLength(2);
    expect(reconnectCatalogBoardCard()).toEqual({
      okSources: 3,
      refuseReasons: 2,
      inventsScene: 0,
    });
    expect(reconnectCatalogStatusLineMatches()).toBe(true);
    expect(reconnectCatalogStatusLineConsistent(reconnectCatalogStatusLine())).toBe(true);
    expect(isDeclaredReconnectSource('server')).toBe(true);
    expect(isDeclaredReconnectRefuseReason('server_invalid')).toBe(true);
    expect(parseReconnectCatalogStatusLine('nope')).toBeNull();

    const ok: ReconnectBoardInput = { status: 'ok', source: 'server' };
    expect(reconnectResultBoardCard(ok)).toEqual({
      status: 'ok',
      source: 'server',
      reason: '-',
    });
    expect(reconnectResultStatusLineMatches(ok)).toBe(true);
    expect(reconnectResultExportText(ok).startsWith(reconnectResultExportHeader())).toBe(true);
    expect(reconnectResultExportLine(ok)).toBe('ok,server,-');

    const refuse: ReconnectBoardInput = { status: 'refuse', reason: 'server_invalid' };
    expect(reconnectResultStatusLine(refuse)).toBe(
      'status=refuse source=- reason=server_invalid',
    );
    expect(reconnectResultStatusLineMatches(refuse)).toBe(true);
    expect(reconnectResultStatusLineConsistent(reconnectResultStatusLine(refuse))).toBe(true);
    expect(parseReconnectResultStatusLine('nope')).toBeNull();
  });
});
