<template>
  <CustodyNotBuilt :heading="$t('intafaced.trade.depositHeading')" />
</template>

<script>
/**
 * DEPOSIT ADDRESS SCREEN — NOT BUILT, and says so.
 *
 * Every call this screen made went to the retired Java ucenter
 * (ADR 2026-08-02, Option B). There is no endpoint on our surface to
 * repoint them at, because this platform has no chain custody: the
 * vendored wallet RPC is unadopted until a security review clears it, and
 * that review is a precondition of adoption rather than a follow-up.
 *
 * The refusal lives in CustodyNotBuilt.vue, shared by all three custody
 * screens so the three cannot drift into telling a user three different
 * stories about the same missing capability.
 *
 * The vendor workflow is preserved in git history and returns against a
 * real custody service rather than being rebuilt from nothing.
 */
import CustodyNotBuilt from "./CustodyNotBuilt.vue";

export default {
  components: { CustodyNotBuilt }
};
</script>
