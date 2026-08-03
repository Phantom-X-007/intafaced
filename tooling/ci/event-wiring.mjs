#!/usr/bin/env node
/**
 * EVENT WIRING — a declared subject has a publisher and a subscriber, or a reason.
 *
 * ── The three failures this exists for ──────────────────────────────────────
 *
 * Three separate audits hit the event bus from three directions and each found
 * the same shape. Not one of them was found on purpose:
 *
 *   1. `bankMarginCalled` is a fully-built event. Its schema is careful, its
 *      consumer in svc-notify is complete — severity `critical`, a business key
 *      of `<loanId>:<sequence>`, the lot. NOTHING PUBLISHES IT. svc-bank depends
 *      on neither `@intafaced/events` nor `nats`, and no service claims the
 *      `bank` stream, so `INTAFACED_BANK` has never existed. svc-notify has
 *      therefore logged a warning about a consumer it cannot attach on every
 *      boot since it shipped.
 *
 *   2. `xpEarned` is published by svc-p2p AND svc-trade, and read by nobody. Both
 *      producers say in their own comments that svc-identity is the way into
 *      `rank_state`; svc-identity subscribes to two blueprint subjects and
 *      nothing else. The tracker called `p2p.reputation` done on the strength of
 *      reputation "feeding the same XP graph". It does not reach the graph.
 *
 *   3. `orderFilled` "dropped account ids". The cause was a stale build: zod
 *      silently strips unknown keys, so a consumer compiled against an older
 *      schema deletes fields with no error anywhere. That one is fixed in
 *      `packages/events/src/bus.ts` — the bus now refuses rather than strips —
 *      and it is named here because it is the same disease: the bus could not
 *      tell anyone that two sides of a subject disagreed.
 *
 * The common shape: THE BUS COULD NOT REPORT SILENCE. An event with no producer,
 * no consumer, or a schema mismatch looked exactly like an event that was fine.
 * Each cost an engineer real time and each was found by accident.
 *
 * ── What this gate forbids ──────────────────────────────────────────────────
 *
 * Silence. Not orphans — orphans are frequently legitimate, and `bankMarginCalled`
 * is one: a socket deliberately opened ahead of its publisher. What is forbidden
 * is an orphan NOBODY WROTE DOWN. Every unwired end is either an entry in
 * `WIRING_SOCKETS` (packages/events/src/catalog.ts) carrying a reason a human
 * typed, or this exits 1.
 *
 * Same principle as `workspace-sync` check 7, and the same escape hatch shape as
 * its `# no-deploy:` comment: the deliberate case must be declared, in a file a
 * reviewer reads, in prose.
 *
 * DELETING AN EVENT IS NEVER HOW YOU MAKE THIS PASS. An orphan is a finding.
 *
 * ── Why it will not cry wolf ────────────────────────────────────────────────
 *
 * A gate that fires on prose gets switched off, and then the real failure it was
 * written for goes through it unnoticed. `workspace-sync` check 6 went red on
 * `main` for everyone because it matched a COMMENT. So:
 *
 *   · comments are blanked before anything is matched — character-for-character,
 *     newlines kept, so every line number reported is the real one;
 *   · `*.test.ts` / `*.spec.ts` are not wiring. A subject that only a test
 *     publishes has no publisher;
 *   · every regex here is a REGEX LITERAL. `\s` inside a template literal is the
 *     letter s, which has silently broken two gates in this repo in two days
 *     (see workspace-sync checks 3b and 7);
 *   · anything it cannot resolve is reported as unresolvable rather than guessed
 *     at in either direction. A gate that quietly assumes "wired" hides the bug
 *     it exists to find; one that quietly assumes "orphan" is the wolf.
 *
 * Exit 0 = every declared subject is wired at both ends, or recorded as a socket.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', '.next', 'coverage', 'vendor', '.git', 'drizzle']);
const ROOTS = ['services', 'apps', 'packages'];

/** Under 40 characters is a placeholder, not a reason. "TODO" is 4. */
const MIN_REASON = 40;

const failures = [];
const fail = (file, reason) => failures.push({ file, reason });

// ── source helpers ──────────────────────────────────────────────────────────

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|mts)$/.test(name)) yield full;
  }
}

/**
 * Replace every comment with spaces, keeping newlines and total length.
 *
 * Blanking rather than deleting is what lets every line number this gate prints
 * point at the real line in the real file — an offset-shifting strip would make
 * every reported location subtly wrong, which is its own kind of crying wolf.
 *
 * String literals are walked over rather than through, so a `//` inside a URL or
 * an apostrophe inside prose cannot start or end a comment.
 */
function blankComments(src) {
  const out = src.split('');
  const n = src.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  let i = 0;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      const start = i;
      while (i < n && src[i] !== '\n') i++;
      blank(start, i);
      continue;
    }
    if (c === '/' && d === '*') {
      const start = i;
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      blank(start, i);
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      i++;
      while (i < n) {
        if (src[i] === '\\') {
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join('');
}

const lineOf = (src, index) => src.slice(0, index).split('\n').length;
const posix = (p) => p.split('\\').join('/');
const isTestFile = (rel) => /\.(test|spec)\.(ts|tsx|mts)$/.test(rel);

// ── 1 · the catalog: what is declared, and what is recorded as unwired ───────

const catalogPath = 'packages/events/src/catalog.ts';
const catalogRaw = existsSync(join(ROOT, catalogPath)) ? readFileSync(join(ROOT, catalogPath), 'utf8') : null;
if (catalogRaw === null) {
  console.error(`  ✖ event-wiring — ${catalogPath} is missing; there is no catalog to check`);
  process.exit(1);
}

const registryBlock = /export const EVENT_CATALOG = \{([\s\S]*?)\} as const;/.exec(blankComments(catalogRaw));
if (registryBlock === null) {
  console.error(`  ✖ event-wiring — could not find "export const EVENT_CATALOG = { … } as const;" in ${catalogPath}`);
  process.exit(1);
}
const EVENTS = [...registryBlock[1].matchAll(/^\s*([A-Za-z_$][\w$]*),/gm)].map(([, name]) => name);
const isEvent = (name) => EVENTS.includes(name);

/**
 * The declared sockets.
 *
 * Parsed from source rather than imported, so this runs on a checkout that has
 * never been built — a gate that needs `dist` to exist cannot report on the
 * staleness of `dist`. TypeScript's `satisfies` covers what a regex cannot: an
 * entry naming an event that does not exist is a compile error over there.
 *
 * `reason` is matched as one or more single-quoted literals so a prettier-wrapped
 * or `+`-concatenated string is read whole rather than truncated.
 */
const socketsBlock = /export const WIRING_SOCKETS = \[([\s\S]*?)\n\] satisfies/.exec(blankComments(catalogRaw));
const sockets = [];
if (socketsBlock === null) {
  fail(catalogPath, 'no "export const WIRING_SOCKETS = [ … ] satisfies readonly WiringSocket[];" — every unwired event would have nowhere to be declared, which is the silence this gate exists to forbid');
} else {
  const entry = /event:\s*'([A-Za-z_$][\w$]*)'\s*,\s*missing:\s*'(publisher|subscriber)'\s*,\s*reason:\s*((?:'(?:[^'\\]|\\.)*'\s*\+?\s*)+)/g;
  for (const m of socketsBlock[1].matchAll(entry)) {
    const [, event, missing, reasonSrc] = m;
    const reason = [...reasonSrc.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(([, s]) => s).join('');
    sockets.push({ event, missing, reason, line: lineOf(catalogRaw, socketsBlock.index + m.index) });
  }
}

for (const s of sockets) {
  if (!isEvent(s.event)) {
    fail(catalogPath, `WIRING_SOCKETS declares a socket for "${s.event}", which is not in EVENT_CATALOG — a socket cannot outlive the event it excuses`);
  }
  if (s.reason.trim().length < MIN_REASON) {
    fail(
      catalogPath,
      `the ${s.missing} socket for "${s.event}" has a ${s.reason.trim().length}-character reason — under ${MIN_REASON} is a placeholder, and a socket list of placeholders is a suppression list. Say what is missing and why that is acceptable today`,
    );
  }
}
const seenSockets = new Set();
for (const s of sockets) {
  const key = `${s.event}::${s.missing}`;
  if (seenSockets.has(key)) fail(catalogPath, `WIRING_SOCKETS declares the ${s.missing} socket for "${s.event}" twice — two reasons for one gap means one of them is stale`);
  seenSockets.add(key);
}
const socketFor = (event, missing) => sockets.find((s) => s.event === event && s.missing === missing) ?? null;

// ── 2 · the code: who publishes, who subscribes ─────────────────────────────

/**
 * Only a file that imports the bus can wire the bus, so that is the population.
 * A `.publish('orderFilled')` in a file that does NOT import it is reported
 * below rather than counted or ignored — see check 4.
 */
const files = [];
for (const root of ROOTS) {
  for (const abs of walk(join(ROOT, root))) {
    const rel = posix(relative(ROOT, abs));
    // packages/events is the bus itself. Its internals call `.publish()` on the
    // NATS client and its tests publish every subject in the catalog; counting
    // either would mean the bus wires itself and nothing is ever an orphan.
    if (rel.startsWith('packages/events/')) continue;
    const raw = readFileSync(abs, 'utf8');
    files.push({ rel, raw, src: blankComments(raw), test: isTestFile(rel), busAware: raw.includes('@intafaced/events') });
  }
}

const publishers = new Map(EVENTS.map((e) => [e, []]));
const subscribers = new Map(EVENTS.map((e) => [e, []]));
const sideFor = (direction) => (direction === 'publish' ? publishers : subscribers);

const BUS_CALL = /\.(publish|subscribe)\s*(?:<[^>()]*>)?\(\s*/g;
const FIRST_ARG_LITERAL = /^(['"])([A-Za-z_$][\w$]*)\1/;
/** `function name(`, `const name =`, `const name:` — the nearest one above an index. */
const ENCLOSING_FN = /(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[=:])/g;

/**
 * Relays: a local helper that takes the event name as a PARAMETER.
 *
 * svc-notify does not call `bus.subscribe('kycApproved', …)`. It calls a local
 * `attach(bus, 'kycApproved', …)` that wraps the subscribe so a consumer whose
 * stream does not exist yet is reported instead of thrown. A literal-only scan
 * reads all nine of its consumers as absent and declares nine false orphans —
 * including `kycApproved` and `stakeCreated`, which are wired and working.
 *
 * That is exactly the wolf this gate must not cry, so one level of indirection
 * is resolved: a named function in a bus-aware file that calls `.subscribe(x)`
 * on a non-literal becomes a subscribe-relay, and a call to it carrying a
 * catalog event literal counts as a subscriber. Module-local only — a relay is
 * matched against calls in its own file, so an unrelated same-named helper in
 * another package cannot be mistaken for one.
 */
const relays = new Map();
const unresolved = [];

for (const file of files) {
  if (file.test || !file.busAware) continue;
  BUS_CALL.lastIndex = 0;
  let call;
  while ((call = BUS_CALL.exec(file.src))) {
    const direction = call[1];
    const rest = file.src.slice(call.index + call[0].length);
    const literal = FIRST_ARG_LITERAL.exec(rest);

    if (literal) {
      // A literal that is not a catalog key is some other publish/subscribe
      // (a hub, a store). Not this gate's business.
      if (isEvent(literal[2])) sideFor(direction).get(literal[2]).push(`${file.rel}:${lineOf(file.src, call.index)}`);
      continue;
    }

    ENCLOSING_FN.lastIndex = 0;
    let name = null;
    let match;
    while ((match = ENCLOSING_FN.exec(file.src)) && match.index < call.index) name = match[1] ?? match[2];
    if (name) relays.set(`${file.rel}::${name}`, direction);
    else unresolved.push(`${file.rel}:${lineOf(file.src, call.index)} — .${direction}() on a computed name with no enclosing function to resolve it through`);
  }
}

const relaysUsed = new Set();
for (const file of files) {
  if (file.test) continue;
  for (const [key, direction] of relays) {
    const [relayFile, fn] = key.split('::');
    if (relayFile !== file.rel) continue;
    for (const call of file.src.matchAll(new RegExp(`\\b${fn}\\s*(?:<[^>()]*>)?\\(`, 'g'))) {
      // The event name is an argument to the relay, not necessarily the first —
      // svc-notify passes the bus first. Read the argument list, take the first
      // catalog key in it.
      const args = file.src.slice(call.index, call.index + 400);
      const named = [...args.matchAll(/(['"])([A-Za-z_$][\w$]*)\1/g)].map(([, , n]) => n).find(isEvent);
      if (named === undefined) continue;
      relaysUsed.add(key);
      sideFor(direction).get(named).push(`${file.rel}:${lineOf(file.src, call.index)} (via ${fn}())`);
    }
  }
}

for (const [key, direction] of relays) {
  if (relaysUsed.has(key)) continue;
  const [relayFile, fn] = key.split('::');
  unresolved.push(`${relayFile} — ${fn}() ${direction}es a computed event name and is never called with a catalog event, so what it wires cannot be determined`);
}

// ── 3 · every declared event is wired at both ends, or recorded ─────────────

for (const event of EVENTS) {
  for (const [missing, wired] of [
    ['publisher', publishers.get(event)],
    ['subscriber', subscribers.get(event)],
  ]) {
    const socket = socketFor(event, missing);

    if (wired.length === 0 && socket === null) {
      const other = missing === 'publisher' ? subscribers.get(event) : publishers.get(event);
      const otherEnd =
        other.length > 0
          ? `the other end is live at ${other.slice(0, 2).join(', ')}${other.length > 2 ? ` (+${other.length - 2})` : ''}`
          : 'neither end is wired — this subject is declared and completely unused';
      fail(
        catalogPath,
        `"${event}" has no ${missing} anywhere in services/, apps/ or packages/ — ${otherEnd}. ` +
          `Wire it, or add a WIRING_SOCKETS entry saying why an unwired ${missing} is acceptable. Do NOT delete the event: an orphan is a finding, and some are sockets waiting for a publisher`,
      );
    }

    // The other direction, and the reason this list cannot rot into a suppression
    // list: a socket kept after the gap closed is a written claim that something
    // is missing when it is not, and the next reader believes it.
    if (wired.length > 0 && socket !== null) {
      fail(
        catalogPath,
        `WIRING_SOCKETS still records "${event}" as having no ${missing} (line ${socket.line}), but one exists at ${wired[0]} — delete the socket entry; a stale socket is a lie about the system that outlives the gap it described`,
      );
    }
  }
}

// ── 4 · nothing wires the bus where this gate cannot see it ─────────────────
//
// The scan above trusts one thing: that a file wiring the bus imports the bus.
// If that stops being true the gate does not go quiet about it — a subject
// published from a file it never read would be reported as an orphan (a wolf),
// or worse, a real orphan would be excused by wiring it cannot verify.
for (const file of files) {
  if (file.busAware || file.test) continue;
  for (const call of file.src.matchAll(/\.(publish|subscribe)\s*(?:<[^>()]*>)?\(\s*(['"])([A-Za-z_$][\w$]*)\2/g)) {
    if (!isEvent(call[3])) continue;
    fail(
      file.rel,
      `line ${lineOf(file.src, call.index)} ${call[1]}es the catalog event "${call[3]}" but this file does not import @intafaced/events — either it is reaching the bus by a route this gate cannot follow, or the name collides with a catalog event by accident. Both need a human`,
    );
  }
}

for (const u of unresolved) fail('event wiring', `${u} — this gate will not guess in either direction`);

// ── report ──────────────────────────────────────────────────────────────────

const wiredBoth = EVENTS.filter((e) => publishers.get(e).length > 0 && subscribers.get(e).length > 0).length;

if (failures.length === 0) {
  console.log(
    `  ✓ event-wiring clean — ${EVENTS.length} declared event(s): ${wiredBoth} wired end to end, ${sockets.length} recorded socket(s) with a written reason`,
  );
  process.exitCode = 0;
} else {
  console.error(`  ✖ event-wiring — ${failures.length} problem(s)`);
  for (const f of failures) console.error(`        · ${f.file}: ${f.reason}`);
  console.error('\n  A subject nobody publishes, or nobody reads, is not a contract — and the bus cannot tell you on its own (§10).');
  process.exitCode = 1;
}
