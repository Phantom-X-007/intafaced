import { describe, expect, it } from 'vitest';
import {
  agentActionKindCatalogBoardCard,
  agentActionKindCatalogStatusLine,
  parseAgentActionKindCatalogStatusLine,
  agentActionKindCatalogStatusLineMatches,
  agentActionKindCatalogStatusLineConsistent,
  agentActionKindCatalogExportHeader,
  agentActionKindCatalogExportLines,
  agentActionKindCatalogExportText,
  isDeclaredAgentActionKind,
  AGENT_ACTION_KINDS,
} from './agent-action-kind-honesty.js';

describe('L3 wave219 agent-action-kind catalog honesty', () => {
  it('agent action kind catalog boards', () => {
    expect(AGENT_ACTION_KINDS).toEqual(['session_open', 'session_close', 'completion', 'embedding', 'tool_call', 'usage_settlement']);
    expect(agentActionKindCatalogBoardCard()).toEqual({
      kinds: 6,
      hasSessionOpen: 1,
      hasCompletion: 1,
      hasToolCall: 1,
      hasUsageSettlement: 1,
    });
    expect(agentActionKindCatalogStatusLine()).toBe('kinds=6 session_open=1 completion=1 tool_call=1 usage_settlement=1');
    expect(agentActionKindCatalogStatusLineMatches()).toBe(true);
    expect(agentActionKindCatalogStatusLineConsistent(agentActionKindCatalogStatusLine())).toBe(true);
    expect(agentActionKindCatalogExportText().startsWith(agentActionKindCatalogExportHeader())).toBe(true);
    expect(agentActionKindCatalogExportLines()).toEqual([...AGENT_ACTION_KINDS]);
    expect(isDeclaredAgentActionKind('tool_call')).toBe(true);
    expect(isDeclaredAgentActionKind('chat')).toBe(false);
    expect(parseAgentActionKindCatalogStatusLine('nope')).toBeNull();
  });
});
