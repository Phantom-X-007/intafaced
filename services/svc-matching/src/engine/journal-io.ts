import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { encode, type EngineJournal, type JournalCommand, type JournalRecord } from './journal-codec.js';

// ── Implementations ──────────────────────────────────────

/** For tests and single-process dev. Durable only for the life of the process. */
export class MemoryJournal implements EngineJournal {
  private readonly records: JournalRecord[] = [];

  append(command: JournalCommand): JournalRecord {
    const record = { ...command, seq: this.records.length + 1 } as JournalRecord;
    this.records.push(record);
    return record;
  }

  read(): readonly JournalRecord[] {
    return this.records;
  }

  get length(): number {
    return this.records.length;
  }

  close(): void {
    // Nothing to release.
  }
}

/**
 * Append-only NDJSON on disk, fsync'd per record.
 *
 * The fsync is the whole point and it is not negotiable: an input that is only
 * in the page cache is an input the recovery guarantee does not cover. This
 * costs throughput, which is why §5.1 marks the engine for a Rust port rather
 * than asking this file to be clever.
 *
 * SOCKET §13 — durable journal transport. A replicated log (Postgres
 * `matching.engine_journal`, or a JetStream work queue) replaces this class
 * without touching `EngineJournal`'s three methods when the engine goes
 * multi-replica.
 */
export class FileJournal implements EngineJournal {
  private readonly fd: number;
  private records: JournalRecord[];

  constructor(readonly path: string) {
    /**
     * Crash mid-write can leave a partial last NDJSON line. `decodeAll` skips
     * that residue so recovery can boot (#1520). But the torn bytes still sit
     * on disk — opening O_APPEND without rewriting would glue the next durable
     * append onto the tear, so a later boot either drops a real record or
     * throws mid-file corruption and refuses recovery. Rewrite the decoded
     * records as the clean durable body before any further append.
     */
    this.records = existsSync(path) ? decodeAll(readFileSync(path, 'utf8')) : [];
    rewriteClean(path, this.records);
    this.fd = openSync(path, 'a');
  }

  append(command: JournalCommand): JournalRecord {
    const record = { ...command, seq: this.records.length + 1 } as JournalRecord;
    const line = `${encode(record)}\n`;
    const expected = Buffer.byteLength(line, 'utf8');
    const written = writeSync(this.fd, line);
    if (written !== expected) {
      // Do not push to memory: a short write is not durable and must not look
      // like an admitted input. The process dies or the caller retries; either
      // way the on-disk body stays a complete prefix.
      throw new Error(`short journal write: wrote ${written} of ${expected} bytes at ${this.path}`);
    }
    fsyncSync(this.fd);
    this.records.push(record);
    return record;
  }

  read(): readonly JournalRecord[] {
    return this.records;
  }

  get length(): number {
    return this.records.length;
  }

  close(): void {
    closeSync(this.fd);
  }
}

/** Replace the file with exactly the durable records (no torn tail residue). */
function rewriteClean(path: string, records: readonly JournalRecord[]): void {
  const body = records.length === 0 ? '' : `${records.map((r) => encode(r)).join('\n')}\n`;
  writeFileSync(path, body, 'utf8');
  // writeFileSync does not fsync. Durability of the rewrite matters: if we
  // crash after truncating-away the partial line but before the clean body is
  // on stable storage, recovery still boots (empty or older complete prefix)
  // — never from glued garbage.
  const fd = openSync(path, 'r+');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Decode an NDJSON journal body.
 *
 * A crash mid-write can leave a partial last line (write started, fsync never
 * finished). That is not corruption of history — it is an input that never
 * became durable, so recovery must skip it and boot. A broken line in the
 * middle of the file is real corruption and still throws.
 */
export function decodeAll(contents: string): JournalRecord[] {
  const lines = contents.split('\n');
  const records: JournalRecord[] = [];
  // Last element of split is often '' after a trailing newline — track the
  // last non-empty line index so we know when a parse failure is terminal residue.
  let lastNonEmpty = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim().length > 0) lastNonEmpty = i;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim().length === 0) continue;
    try {
      records.push(JSON.parse(line) as JournalRecord);
    } catch (err) {
      if (i === lastNonEmpty) {
        // Truncated tail — durable records above stand; this input never landed.
        continue;
      }
      throw err;
    }
  }
  return records;
}
