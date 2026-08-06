import { describe, expect, it } from 'vitest';
import {
  canvasErrorCatalogBoardCard,
  canvasErrorCatalogStatusLine,
  parseCanvasErrorCatalogStatusLine,
  canvasErrorCatalogStatusLineMatches,
  canvasErrorCatalogStatusLineConsistent,
  canvasErrorCatalogExportHeader,
  canvasErrorCatalogExportLines,
  canvasErrorCatalogExportText,
  isDeclaredCanvasErrorCode,
  CANVAS_ERROR_CODES,
} from './canvas-error-honesty.js';

describe('L3 wave137 canvas error catalog honesty', () => {
  it('error code catalog boards', () => {
    expect(CANVAS_ERROR_CODES).toHaveLength(6);
    expect(canvasErrorCatalogBoardCard()).toEqual({
      codes: 6,
      hasOutOfBounds: 1,
      hasAvatarMissing: 1,
      hasPropExists: 1,
    });
    expect(canvasErrorCatalogStatusLine()).toBe('codes=6 out_of_bounds=1 avatar_missing=1 prop_exists=1');
    expect(canvasErrorCatalogStatusLineMatches()).toBe(true);
    expect(canvasErrorCatalogStatusLineConsistent(canvasErrorCatalogStatusLine())).toBe(true);
    expect(canvasErrorCatalogExportText().startsWith(canvasErrorCatalogExportHeader())).toBe(true);
    expect(canvasErrorCatalogExportLines()).toEqual([...CANVAS_ERROR_CODES]);
    expect(isDeclaredCanvasErrorCode('academy.scene_invalid')).toBe(true);
    expect(isDeclaredCanvasErrorCode('academy.chat_leak')).toBe(false);
    expect(parseCanvasErrorCatalogStatusLine('nope')).toBeNull();
  });
});
