/**
 * THE ENGINE JOURNAL (§5.1). Barrel — implementations live in mill files.
 *
 * "Every input persisted to an append-only engine_journal before processing →
 *  full replay = current book state (recovery guarantee)."
 */
export type { EngineJournal, JournalCommand, JournalRecord } from './journal-codec.js';
export type { WireAmendPatch, WireComboLeg, WireOrder } from './journal-wire.js';
export { fromWire, fromWireAmend, toWire, toWireAmend } from './journal-wire.js';
export { decodeAll, FileJournal, MemoryJournal } from './journal-io.js';
export type { EngineSnapshot } from './journal-replay.js';
export { replay, replayFrom, restore, restoreAll, serializeBooks, snapshot, snapshotAll } from './journal-replay.js';
export type { GatewayStamp, JournalGap, TransitionReconstruction } from './journal-gaps.js';
export { JOURNAL_GAP, reconstructTransitions } from './journal-gaps.js';
