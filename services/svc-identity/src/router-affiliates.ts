import { router } from '@intafaced/contracts';
import { affiliateTreeRoutes } from './router-affiliates-tree.js';
import { affiliateMoneyRoutes } from './router-affiliates-money.js';
import type { AffiliateRouterArgs } from './router-affiliates-tree.js';

export function createAffiliatesRouter(args: AffiliateRouterArgs) {
  return router({
    ...affiliateTreeRoutes(args),
    ...affiliateMoneyRoutes(args),
  });
}
