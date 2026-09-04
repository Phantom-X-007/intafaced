<template>
  <section class="custody-refusal">
    <h1>{{ heading }}</h1>
    <p class="custody-refusal-kicker">CustodyNotBuilt</p>
    <p>{{ $t('intafaced.trade.custodyBody') }}</p>
    <dl>
      <div><dt>Platform ledger</dt><dd>Unknown</dd></div>
      <div><dt>Venue trading</dt><dd>Unknown</dd></div>
      <div><dt>Chain custody</dt><dd>Not live</dd></div>
    </dl>
    <router-link to="/uc/money" class="custody-refusal-link">Go to balances</router-link>
  </section>
</template>

<script>
/**
 * THE SCREEN FOR A CAPABILITY THAT DOES NOT EXIST.
 *
 * Deposits, withdrawals and saved withdrawal addresses all pointed at
 * `/uc/asset/wallet/*` and `/uc/withdraw/*` on the retired Java ucenter (ADR
 * 2026-08-02, Option B). There is no endpoint on our surface to repoint them
 * at, and that is not an oversight: this platform has no chain custody at all.
 * The vendored `01_wallet_rpc` would provide it, and the same ADR gates its
 * adoption behind a security review that nobody has performed — until then it
 * does not touch a chain holding value.
 *
 * WHY A REFUSAL AND NOT A DISABLED FORM. A greyed-out deposit form reads as
 * "temporarily unavailable, try later". A form that submits into a dead host
 * reads as "something went wrong on your end". Both invite a user to keep
 * trying, and one of them invites them to wait for money that will never
 * arrive. Neither is true, and the truth — this is not built — is the only
 * thing that lets somebody make a decision.
 *
 * Platform ledger and venue trading are Unknown: this screen does not probe
 * those services. "Live" without a probe is a lie. Chain custody is Not live
 * because it is not built — that one we know.
 *
 * The vendor's original deposit/withdraw markup and workflow are preserved in
 * git history. When wallet RPC clears its security review, they come back
 * against a real custody service rather than being rebuilt from nothing.
 */
export default {
  name: 'CustodyNotBuilt',
  props: {
    /** Which of the three screens this is standing in for. */
    heading: { type: String, default: '' }
  }
};
</script>

<style scoped>
.custody-refusal { max-width: 720px; color: #8a8a8a; }
.custody-refusal h1 { margin: 0 0 8px; color: #e8e8e8; font-size: 16px; letter-spacing: .04em; }
.custody-refusal-kicker { color: #c8c8c8; font: 11px ui-monospace, Menlo, monospace; letter-spacing: .08em; }
.custody-refusal p { font-size: 12px; line-height: 1.6; }
.custody-refusal dl { margin: 22px 0; border-top: 1px solid #202020; }
.custody-refusal dl div { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #202020; }
.custody-refusal dt, .custody-refusal dd { margin: 0; font-size: 12px; }
.custody-refusal dd { color: #c8c8c8; }
.custody-refusal-link { display: inline-block; padding: 6px 9px; color: #c8c8c8; border: 1px solid #343434; font-size: 11px; }
</style>
