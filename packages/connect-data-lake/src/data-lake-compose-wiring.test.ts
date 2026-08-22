import { describe, expect, it } from 'vitest';
import {
  connectLakeRetentionOwnerEnvComposeWired,
  connectLakeTsdbComposeWired,
  connectLakeTsdbInitPresent,
  edgeComposeBlock,
} from './data-lake-compose-wiring.js';

describe('connect.data-lake fleet compose wiring', () => {
  it('postgres-init ships connect_lake schema bootstrap', () => {
    expect(connectLakeTsdbInitPresent()).toBe(true);
  });

  it('svc-edge declares fleet TSDB URL for connect.data-lake', () => {
    expect(connectLakeTsdbComposeWired()).toBe(true);
    expect(edgeComposeBlock()).toMatch(/CONNECT_DATA_LAKE_TSDB_URL:/);
  });

  it('svc-edge passes retention owner env key without inventing TTL', () => {
    expect(connectLakeRetentionOwnerEnvComposeWired()).toBe(true);
    expect(edgeComposeBlock()).not.toMatch(/CONNECT_DATA_LAKE_RETENTION_DAYS:\s*\$\{CONNECT_DATA_LAKE_RETENTION_DAYS:-\d+\}/);
  });
});
