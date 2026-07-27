import { isUsable, supports, type RailAdapter, type RailCapability } from './rail-adapter.js';

export class UnknownRailError extends Error {
  readonly code = 'pay.rail_unknown';
  constructor(railId: string, known: readonly string[]) {
    super(`No rail adapter "${railId}". Registered: ${known.join(', ') || '(none)'}`);
    this.name = 'UnknownRailError';
  }
}

export class RailCapabilityError extends Error {
  readonly code = 'pay.rail_capability';
  constructor(railId: string, capability: RailCapability) {
    super(`Rail "${railId}" does not support ${capability}`);
    this.name = 'RailCapabilityError';
  }
}

/**
 * The registry the core resolves rails through.
 *
 * Deliberately dumb: it maps an id to an adapter and answers questions about
 * capability. It does NOT choose between rails — smart routing (geo, method,
 * amount band, risk score, live approval rates) is its own tracker feature, and
 * putting even a little of it here would be the beginning of a core that knows
 * which rail it is talking to.
 *
 * Adding a rail is: construct it, pass it in. That is the "zero core changes"
 * claim, and this class is where it is either true or not.
 */
export class RailRegistry {
  private readonly byId: ReadonlyMap<string, RailAdapter>;

  constructor(adapters: readonly RailAdapter[]) {
    const map = new Map<string, RailAdapter>();
    for (const adapter of adapters) {
      if (map.has(adapter.id)) {
        // Two adapters answering to one id means `payments.rail_adapter` no
        // longer identifies who holds the money for a given payment.
        throw new Error(`Duplicate rail adapter id "${adapter.id}"`);
      }
      map.set(adapter.id, adapter);
    }
    this.byId = map;
  }

  ids(): string[] {
    return [...this.byId.keys()];
  }

  list(): RailAdapter[] {
    return [...this.byId.values()];
  }

  has(railId: string): boolean {
    return this.byId.has(railId);
  }

  get(railId: string): RailAdapter {
    const adapter = this.byId.get(railId);
    if (!adapter) throw new UnknownRailError(railId, this.ids());
    return adapter;
  }

  /**
   * Resolve a rail and assert it can do the thing about to be asked of it.
   *
   * Checked at the call site rather than discovered from a thrown
   * `NotImplemented` halfway through, because "halfway through" on this path
   * means after the ledger has already moved.
   */
  require(railId: string, capability: RailCapability): RailAdapter {
    const adapter = this.get(railId);
    if (!supports(adapter, capability)) throw new RailCapabilityError(railId, capability);
    return adapter;
  }

  /** Rails currently healthy and fresh — what an operator dashboard renders. */
  usable(now: Date = new Date()): RailAdapter[] {
    return this.list().filter((a) => isUsable(a, now));
  }

  health(now: Date = new Date()) {
    return this.list().map((a) => ({ id: a.id, capabilities: a.capabilities, usable: isUsable(a, now), ...a.health() }));
  }
}
