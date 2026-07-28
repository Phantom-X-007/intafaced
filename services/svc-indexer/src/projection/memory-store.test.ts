import { MemoryProjectionStore } from './memory-store.js';
import { CHAIN_ID, runProjectionConformance } from '../testing/conformance.js';

/**
 * The reference implementation, under the same suite the Postgres store runs.
 *
 * Requires nothing: no database, no chain, no network. That is deliberate —
 * the reorg property this service is built around is checked on every
 * `pnpm test`, not only where infrastructure happens to be up.
 */
runProjectionConformance('MemoryProjectionStore', async () => {
  let store = new MemoryProjectionStore(CHAIN_ID);
  return {
    get store() {
      return store;
    },
    reset: async () => {
      store = new MemoryProjectionStore(CHAIN_ID);
    },
  };
});
