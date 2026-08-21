import { describe, expect, it } from 'vitest';
import { describeDataLakeStage1 } from './data-lake-stage1.js';

describe('describeDataLakeStage1', () => {
  it('combines capture, batch, and retention honesty', () => {
    const board = describeDataLakeStage1({});
    expect(board.capture.noTsdbInPackage).toBe(true);
    expect(board.batch.writesTsdbInStage1).toBe(false);
    expect(board.retention.canPersist).toBe(false);
  });
});
