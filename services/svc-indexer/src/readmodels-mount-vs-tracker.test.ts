import { describe, expect, it } from 'vitest';
import {
  INDEXER_READMODELS_TRACKER_ID,
  READMODELS_MOUNTED_DOORS,
  indexerReadmodelsMountVsTrackerBoardCard,
  indexerReadmodelsTrackerBackendDoneBarMet,
  readmodelsDoorsInRouterSource,
} from './readmodels-mount-vs-tracker.js';

describe('indexer.readmodels mount vs tracker honest gaps (D26-P1-I3)', () => {
  it('backend done bar met on tip — chain→Postgres read API mounted', () => {
    expect(INDEXER_READMODELS_TRACKER_ID).toBe('indexer.readmodels');
    expect(readmodelsDoorsInRouterSource()).toEqual([...READMODELS_MOUNTED_DOORS]);
    expect(indexerReadmodelsTrackerBackendDoneBarMet()).toBe(true);
    expect(indexerReadmodelsMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
