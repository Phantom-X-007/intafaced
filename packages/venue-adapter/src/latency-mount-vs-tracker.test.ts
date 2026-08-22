import { describe, expect, it } from 'vitest';
import {
  LATENCY_GRADING_TRACKER_ID,
  LATENCY_PRODUCT_SYMBOLS,
  latencyGradingMountVsTrackerBoardCard,
  latencyGradingTrackerBackendDoneBarMet,
  latencyDoneBarTestsPresent,
  latencySymbolsInFabricSource,
  sorConsumesLatencyGrade,
} from './latency-mount-vs-tracker.js';

describe('connect.latency-grading mount vs tracker honest gaps (D26-P1-X1)', () => {
  it('backend done bar met on tip — SOR consumes graded latency', () => {
    expect(LATENCY_GRADING_TRACKER_ID).toBe('connect.latency-grading');
    expect(Array.from(latencySymbolsInFabricSource()).sort()).toEqual(Array.from(LATENCY_PRODUCT_SYMBOLS).sort());
    expect(sorConsumesLatencyGrade()).toBe(true);
    expect(latencyDoneBarTestsPresent()).toBe(true);
    expect(latencyGradingTrackerBackendDoneBarMet()).toBe(true);
    expect(latencyGradingMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});

describe('connect.latency-grading mount vs tracker — D81 denon complete', () => {
  it('full mount board: symbols, SOR consumer, done-bar tests, honest gaps', () => {
    expect(LATENCY_GRADING_TRACKER_ID).toBe('connect.latency-grading');
    const card = latencyGradingMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'connect.latency-grading',
      symbols: LATENCY_PRODUCT_SYMBOLS.length,
      symbolsPresent: LATENCY_PRODUCT_SYMBOLS.length,
      sorConsumer: true,
      gaps: 3,
      backendDoneBarMet: true,
    });
    expect(latencyGradingTrackerBackendDoneBarMet()).toBe(true);
    expect(latencySymbolsInFabricSource()).toEqual([...LATENCY_PRODUCT_SYMBOLS]);
    expect(sorConsumesLatencyGrade()).toBe(true);
    expect(latencyDoneBarTestsPresent()).toBe(true);
  });
});

describe('connect.latency-grading mount vs tracker — D83 denon complete', () => {
  it('full mount board: symbols, SOR consumer, done-bar tests, honest gaps', () => {
    expect(LATENCY_GRADING_TRACKER_ID).toBe('connect.latency-grading');
    const card = latencyGradingMountVsTrackerBoardCard();
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.symbolsPresent).toBe(LATENCY_PRODUCT_SYMBOLS.length);
    expect(card.sorConsumer).toBe(true);
    expect(card.gaps).toBe(3);
    expect(latencyGradingTrackerBackendDoneBarMet()).toBe(true);
    expect(Array.from(latencySymbolsInFabricSource()).sort()).toEqual(Array.from(LATENCY_PRODUCT_SYMBOLS).sort());
    expect(sorConsumesLatencyGrade()).toBe(true);
    expect(latencyDoneBarTestsPresent()).toBe(true);
  });
});

describe('connect.latency-grading mount vs tracker — D85 denon complete', () => {
  it('full mount board: symbols, SOR consumer, done-bar tests, honest gaps', () => {
    expect(LATENCY_GRADING_TRACKER_ID).toBe('connect.latency-grading');
    const card = latencyGradingMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'connect.latency-grading',
      symbols: LATENCY_PRODUCT_SYMBOLS.length,
      symbolsPresent: LATENCY_PRODUCT_SYMBOLS.length,
      sorConsumer: true,
      gaps: 3,
      backendDoneBarMet: true,
    });
    expect(latencyGradingTrackerBackendDoneBarMet()).toBe(true);
    expect(latencySymbolsInFabricSource()).toEqual([...LATENCY_PRODUCT_SYMBOLS]);
    expect(sorConsumesLatencyGrade()).toBe(true);
    expect(latencyDoneBarTestsPresent()).toBe(true);
  });
});

describe('connect.latency-grading mount vs tracker — D87 denon complete', () => {
  it('full mount board: symbols, SOR consumer, done-bar tests, honest gaps', () => {
    expect(LATENCY_GRADING_TRACKER_ID).toBe('connect.latency-grading');
    const card = latencyGradingMountVsTrackerBoardCard();
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.symbolsPresent).toBe(LATENCY_PRODUCT_SYMBOLS.length);
    expect(card.sorConsumer).toBe(true);
    expect(card.gaps).toBe(3);
    expect(latencyGradingTrackerBackendDoneBarMet()).toBe(true);
    expect(Array.from(latencySymbolsInFabricSource()).sort()).toEqual(Array.from(LATENCY_PRODUCT_SYMBOLS).sort());
    expect(sorConsumesLatencyGrade()).toBe(true);
    expect(latencyDoneBarTestsPresent()).toBe(true);
  });
});
