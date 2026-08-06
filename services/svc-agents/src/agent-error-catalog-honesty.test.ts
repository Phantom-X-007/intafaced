import { describe, expect, it } from 'vitest';
import {
  agentErrorCatalogBoardCard,
  agentErrorCatalogStatusLine,
  parseAgentErrorCatalogStatusLine,
  agentErrorCatalogStatusLineMatches,
  agentErrorCatalogStatusLineConsistent,
  agentErrorCatalogExportHeader,
  agentErrorCatalogExportLines,
  agentErrorCatalogExportText,
  isDeclaredAgentErrorCatalogCode,
  AGENT_ERROR_CODE_CATALOG,
} from './agent-error-catalog-honesty.js';

describe('L3 wave168 agent error catalog honesty', () => {
  it('error catalog boards', () => {
    expect(AGENT_ERROR_CODE_CATALOG).toHaveLength(11);
    expect(agentErrorCatalogBoardCard()).toEqual({
      codes: 11,
      provider: 2,
      session: 2,
      refused: 1,
    });
    expect(agentErrorCatalogStatusLine()).toBe('codes=11 provider=2 session=2 refused=1');
    expect(agentErrorCatalogStatusLineMatches()).toBe(true);
    expect(agentErrorCatalogStatusLineConsistent(agentErrorCatalogStatusLine())).toBe(true);
    expect(agentErrorCatalogExportText().startsWith(agentErrorCatalogExportHeader())).toBe(true);
    expect(agentErrorCatalogExportLines()).toEqual([...AGENT_ERROR_CODE_CATALOG]);
    expect(isDeclaredAgentErrorCatalogCode('agents.refused')).toBe(true);
    expect(isDeclaredAgentErrorCatalogCode('agents.vendor_timeout')).toBe(false);
    expect(parseAgentErrorCatalogStatusLine('nope')).toBeNull();
  });
});
