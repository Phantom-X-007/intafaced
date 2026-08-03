<template>
  <div class="nav-rights">
    <div class="nav-right">
      <div class="ix-page" style="padding: 0 15px;">
        <div class="ix-page-head">
          <h1>{{ heading }}</h1>
          <p>{{ $t('intafaced.trade.custodyTitle') }}</p>
        </div>

        <div class="ix-note">
          <strong>{{ $t('intafaced.trade.custodyTitle') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.trade.custodyBody') }}</div>
          <div style="margin-top:12px;">{{ $t('intafaced.trade.custodyLedgerNote') }}</div>
          <div style="margin-top:12px;">
            <router-link to="/uc/money">
              <Button type="primary" size="small">{{ $t('intafaced.trade.goBalances') }}</Button>
            </router-link>
          </div>
        </div>

        <div class="ix-card">
          <div class="ix-card-head">
            <h2>{{ $t('intafaced.trade.custodyWhatExistsTitle') }}</h2>
          </div>
          <div class="ix-kv">
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.trade.custodyLedgerRow') }}</span>
              <span class="v"><code>GET /api/v1/account/balance</code></span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.trade.custodyTradingRow') }}</span>
              <span class="v"><code>POST /api/v1/orders</code></span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.trade.custodyChainRow') }}</span>
              <span class="v">{{ $t('intafaced.trade.custodyChainValue') }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
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
