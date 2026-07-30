import { describe, expect, it } from 'vitest';
import { encodeEventTopics, toEventSignature, type AbiEvent } from 'viem';
import { venueAbi, VENUE_TOPICS } from './abi.js';
// `scripts/` is outside `src/`, so nothing here reaches the shipped service —
// see `sovereignty.test.ts`, which asserts exactly that over the compiled tree.
import { assertSolcPinAgrees, collectSources, computeSourceHash, SUITES, suiteSources } from '../../../scripts/contract-sources.mjs';
import { loadDevVenueArtifact } from '../../../scripts/dev-venue.js';

/**
 * THE HAND-WRITTEN ABI AGAINST THE COMPILER'S OWN OUTPUT.
 *
 * `abi.ts` is written by hand, in svc-protocol's style, so a reviewer can read
 * it. That is worth having and it is worth nothing on its own: a hand-written
 * event signature that differs from the contract's by one type produces a
 * different topic0, the filter matches nothing, and the projection stays empty
 * while every read reports "no liquidity" with total confidence. It is the
 * quietest failure available to a log decoder — no error, no exception, no gap.
 *
 * So the declaration is checked mechanically here: signature by signature,
 * input by input, `indexed` flag by `indexed` flag, and finally topic0 against
 * topic0.
 *
 * ── What this proves and what it does not ──────────────────────────────────
 *
 * It proves `abi.ts` and `contracts/dev/DevVenue.sol` agree. It does NOT make
 * either of them a standard — no audited production venue emits these events
 * (SOCKET §13 `socket.clob-contracts`). When the real one lands, either it emits
 * these signatures or both files change together, and this test is what makes
 * "together" enforced rather than remembered.
 */

const artifact = loadDevVenueArtifact();
const compiledEvents = new Map(
  (artifact.abi as readonly AbiEvent[]).filter((entry) => entry.type === 'event').map((entry) => [entry.name, entry]),
);

describe('svc-indexer · the declared venue ABI matches the compiled contract', () => {
  it('every event this adapter decodes exists on the contract', () => {
    for (const declared of venueAbi) {
      expect(compiledEvents.has(declared.name), `${declared.name} is not on DevVenue`).toBe(true);
    }
  });

  it('agrees on the full canonical signature, and therefore on topic0', () => {
    for (const declared of venueAbi) {
      const compiled = compiledEvents.get(declared.name)!;
      expect(toEventSignature(compiled), declared.name).toBe(toEventSignature(declared as AbiEvent));

      const declaredTopic = encodeEventTopics({ abi: venueAbi, eventName: declared.name })[0];
      const compiledTopic = encodeEventTopics({ abi: [compiled], eventName: declared.name })[0];
      expect(compiledTopic, `topic0 for ${declared.name}`).toBe(declaredTopic);
    }
  });

  /**
   * `indexed` is not part of the canonical signature, so topic0 agreeing does
   * NOT imply the flags agree. Get one wrong and viem looks for the field in the
   * wrong place: an indexed field read as data decodes into garbage, and a data
   * field read as a topic comes back as somebody else's address.
   */
  it('agrees on which inputs are indexed, which topic0 alone would not catch', () => {
    for (const declared of venueAbi) {
      const compiled = compiledEvents.get(declared.name)!;
      expect(
        compiled.inputs.map((i) => [i.name, i.type, i.indexed === true]),
        declared.name,
      ).toEqual(declared.inputs.map((i) => [i.name, i.type, i.indexed === true]));
    }
  });

  it('derives one topic per event, with no collisions', () => {
    expect(VENUE_TOPICS.size).toBe(venueAbi.length);
    expect([...VENUE_TOPICS.values()].sort()).toEqual([...venueAbi.map((e) => e.name)].sort());
  });

  /**
   * §16.10 at the ABI layer. There is no function on `venueAbi` — three events
   * and nothing else — so there is nothing here a future edit could call to move
   * a user's funds even by accident.
   */
  it('exposes no function at all, only events', () => {
    expect(venueAbi.every((entry) => entry.type === 'event')).toBe(true);
  });
});

describe('svc-indexer · the committed artefact matches the source it claims to describe', () => {
  /**
   * Committed bytecode is only trustworthy if it can be shown to come from the
   * tree in front of you. Editing `DevVenue.sol` without re-running
   * `contracts:build` leaves an artefact that still looks authoritative — the
   * exact failure #210 introduced `sourceHash` to catch.
   */
  it('re-derives the sourceHash from the tree', () => {
    const all = collectSources();
    for (const suite of SUITES) {
      expect(computeSourceHash(suiteSources(suite, all)), `suite ${suite.name}`).toBe(artifact.sourceHash);
    }
  });

  it('carries deployable bytecode and runtime code', () => {
    expect(artifact.bytecode.length).toBeGreaterThan(2);
    expect(artifact.deployedBytecode.length).toBeGreaterThan(2);
  });

  /**
   * The one piece of drift the shared toolchain import cannot prevent: `solc`
   * has to be a devDependency of both services, because pnpm's strict isolation
   * means svc-indexer cannot resolve a package only svc-protocol declared. Two
   * compilers in one repo produce two bytecodes.
   */
  it('pins the same solc as the shared toolchain, and built this artefact with it', () => {
    const shared = assertSolcPinAgrees();
    expect(artifact.solcVersion).toBe(shared);
  });
});
