import { describe, expect, it } from 'vitest';
import { describeDataLakeStage1 } from './data-lake-stage1.js';

describe('describeDataLakeStage1', () => {
  it('combines capture, batch, and retention honesty', () => {
    const board = describeDataLakeStage1({});
    expect(board.capture.tsdbWriteWhenOwnerWired).toBe(true);
    expect(board.batch.writesTsdbWhenOwnerWired).toBe(true);
    expect(board.batch.captureLogOnly).toBe(true);
    expect(board.retention.canPersist).toBe(false);
    expect(board.retention.captureLogOnly).toBe(true);
    expect(board.quantSurface.compositeGateWired).toBe(true);
    expect(board.quantSurface.inventsFraming).toBe(false);
    expect(board.quantSurface.edgeCompositeHonestyDoor).toBe('/quant/honesty/assess-composite');
  });
});
