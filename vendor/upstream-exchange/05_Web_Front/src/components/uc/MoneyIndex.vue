<template>
  <section class="ix-money" :class="{ 'is-signed-out': !isLogin, 'is-degraded': isLogin && walletError }">
    <header class="ix-money-head">
      <div>
        <span class="ix-money-kicker">Platform ledger</span>
        <h1>Balances</h1>
        <p>Platform ledger · not a USD total · not the venue wallet</p>
      </div>
      <Input v-if="isLogin && tableMoney.length" class="ix-money-search" :placeholder="$t('common.searchplaceholder')" @on-change="seachInputChange" v-model="searchKey"/>
    </header>
    <section v-if="!isLogin" class="ix-money-gate" aria-labelledby="ix-money-gate-title">
      <span class="ix-money-state-label">Signed out</span>
      <h2 id="ix-money-gate-title">Your ledger stays private.</h2>
      <p>Log in to ask the platform ledger for your balances. Nothing on this screen is a loaded balance.</p>
      <router-link to="/login" class="ix-money-login">Log in</router-link>
    </section>
    <template v-else>
      <div class="ix-money-session">
        <span>Signed in as</span>
        <strong>{{ accountName }}</strong>
        <span class="ix-money-session-mode">Memory session</span>
      </div>
      <div class="ix-money-source">Ledger source · <code>GET /api/v1/account/balance</code></div>
      <!-- i18n-exempt: money OS balances page is English-only; this is a named refuse, not a statement. -->
      <p class="ix-money-source" id="ix-money-pnl-refuse" role="status">Realized vs funding vs fees statements are unavailable — no PnL export is mounted. This book is balances, not a statement.</p>
      <section
        v-if="!tableMoneyShow.length"
        class="ix-money-state"
        :class="{ 'is-error': !!walletError }"
        role="status"
        tabindex="-1"
        ref="walletError"
      >
        <span class="ix-money-state-label">{{ walletError ? 'Ledger unavailable' : (loading ? 'Checking ledger' : 'Ledger reachable') }}</span>
        <h2>{{ walletError ? 'Balances are unknown, not zero.' : balanceStateCopy }}</h2>
        <p v-if="walletError">{{ walletError }}</p>
        <router-link to="/platform">Session details</router-link>
      </section>
      <div v-else class="ix-money-table-wrap">
        <table class="ix-money-table">
          <thead><tr><th>Asset</th><th>Available</th><th>Frozen</th></tr></thead>
          <tbody>
            <tr v-for="row in tableMoneyShow" :key="row.coinType">
              <td>{{ row.coinType }}</td>
              <td :title="row.balance">{{ decimal(row.balance) }}</td>
              <td :title="row.frozenBalance">{{ decimal(row.frozenBalance) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
<script>
/**
 * BALANCES — `GET /api/v1/account/balance` on svc-trade through svc-edge.
 *
 * Was `POST /uc/asset/wallet` on the retired Java ucenter, which read the
 * `member_wallet` table. Under ADR 2026-08-02 that table becomes a read-only
 * projection and `ledger.*` is the single book, so this screen now reads the
 * ledger — via svc-trade's self-only projection, which resolves the owner from
 * the edge-signed principal and never from anything the browser sends.
 *
 * THREE THINGS THIS SCREEN NO LONGER DOES, EACH ON PURPOSE:
 *
 *   - No fiat total. Summing assets needs a price per asset and we publish no
 *     rate source; the old $/¥ headline multiplied balances by `coin.usdRate`
 *     from the vendor payload, which no longer exists and which we cannot
 *     honestly replace.
 *   - No deposit / withdraw buttons. There is no chain custody behind them.
 *   - No "match" flow. It moved value through ucenter, and value only moves
 *     through ledger-client (Doctrine §0.6).
 *
 * Amounts are decimal strings from the ledger and are printed as strings.
 * Nothing here parses one into a JS number.
 */
import { rest, REASON } from "@/config/intafaced.js";
import ixTrade from "@js/ix-trade.js";

export default {
  components: {},
  data() {
    return {
      loading: true,
      walletReachable: false,
      walletError: "",
      tableMoney: [],
      tableMoneyShow: [],
      searchKey: ""
    };
  },
  methods: {
    seachInputChange(){
      this.tableMoneyShow = this.tableMoney.filter(item => item["coinType"].indexOf(this.searchKey.toUpperCase()) == 0);
    },
    /** A decimal string, verbatim. Null/absent is unknown and prints as a dash. */
    decimal(value) {
      if (value === null || value === undefined || value === "") return "—";
      return String(value);
    },
    getMoney() {
      this.loading = true;
      this.walletReachable = false;
      this.walletError = "";
      rest("/account/balance", { token: this.ixToken }).then(res => {
        this.loading = false;
        if (!res.ok) {
          /* A failed read must never look like $0 — that is the one thing a
             balance screen can do that costs a user real money. */
          this.walletError = this.refusalCopy(res);
          this.focusWalletError();
          return;
        }
        const gate = ixTrade.accept(ixTrade.schemas.balances, res.data);
        if (!gate.ok) {
          /* Shape failure (e.g. free as a JSON number) is unknown, never a table. */
          this.walletError =
            (gate.message || "The balance payload failed the shape check.") +
            " — balances are unknown, not zero.";
          this.focusWalletError();
          return;
        }
        this.walletReachable = true;
        /* `balances: {}` → no rows. That is the ledger saying this account
           holds nothing, not a fabricated table of every asset at 0.00. */
        this.tableMoney = ixTrade.toBalanceRows(gate.data).map(row => ({
          coinType: row.unit,
          balance: row.free,
          frozenBalance: row.used,
          total: row.total
        }));
        this.tableMoneyShow = this.tableMoney;
      });
    },

    /** Name the refusal. "Unknown" and "zero" are different facts. */
    refusalCopy(res) {
      if (res.reason === REASON.UNAUTHORIZED) {
        return "Not signed in to the platform session — your ledger balances are unknown, not zero.";
      }
      if (res.reason === REASON.SCOPE_DENIED) {
        return "This session does not carry the trade:read scope — balances are unknown, not zero.";
      }
      if (res.reason === REASON.UNREACHABLE) {
        return "The ledger did not answer — balances are unknown, not zero.";
      }
      return (res.message || "The service refused the request.") +
        " — balances are unknown, not zero.";
    },
    focusWalletError() {
      this.$nextTick(() => {
        const el = this.$refs.walletError;
        if (el && typeof el.focus === "function") el.focus();
      });
    },
    /* REMOVED: getGCCMatchAmount / showMatchDailog / matchGCC / resetAddress.
       Each was a POST to `/uc/asset/wallet/*` on the retired Java ucenter, and
       three of the four MOVED VALUE. Repointing them was not an option: no
       endpoint on our surface does what they did, and Doctrine §0.6 puts every
       balance write behind ledger-client. Leaving buttons that call a dead host
       would have been worse than removing them — a "Match" that silently does
       nothing is indistinguishable from one that worked. Deposits and
       withdrawals are addressed honestly on their own screens. */
  },
  created() {
    this.getMoney();
  },
  computed: {
    isLogin() {
      return this.$store.getters.isLogin;
    },
    accountName() {
      const member = this.$store.state.member || {};
      return member.username || member.id || "Account";
    },
    balanceStateCopy() {
      if (this.walletError) return this.walletError;
      if (this.loading) return this.$t("shellResidual.loadingBalances");
      return this.$t('intafaced.trade.noBalances');
    },
    /** The PLATFORM session token. Not the vendored shell login. */
    ixToken() {
      return this.$store.getters.ixToken;
    },
    tableColumnsMoney() {
      const self = this;
      return [
        {
          title: this.$t('uc.finance.money.cointype'),
          key: 'coinType',
          width: 120,
          align: 'center'
        },
        {
          /* free — spendable right now. */
          title: this.$t('uc.finance.money.balance'),
          key: 'balance',
          align: 'center',
          render(h, params) {
            return h('span', { attrs: { title: params.row.balance } }, self.decimal(params.row.balance));
          }
        },
        {
          /* used — hold + escrow + stake + collateral, summed by the service. */
          title: this.$t('uc.finance.money.frozen'),
          key: 'frozenBalance',
          align: 'center',
          render(h, params) {
            return h('span', { attrs: { title: params.row.frozenBalance } }, self.decimal(params.row.frozenBalance));
          }
        },
        {
          /* free + used. Computed by svc-trade from the ledger rows, not here —
             adding two decimal strings in JavaScript is exactly the float bug
             Doctrine §0.3 exists to prevent. */
          title: self.$t('intafaced.trade.totalColumn'),
          key: 'total',
          align: 'center',
          render(h, params) {
            return h('span', { attrs: { title: params.row.total } }, self.decimal(params.row.total));
          }
        }
        /* NO DEPOSIT / WITHDRAW COLUMN. Both routed to Java ucenter endpoints
           that are retired, and this platform has no chain custody to replace
           them with (ADR 2026-08-02: wallet RPC adoption is gated on a security
           review nobody has done). A disabled button implies soon; a button
           that navigates to a screen which then says nothing works is worse.
           The deposit and withdrawal screens now state it plainly instead. */
      ];
    }
  }
};
</script>
<style lang="scss">
.nav-right {
.rightarea.bill_box {
.shaow {
      padding: 5px;
    }
.money_table {
.search{
        width: 200px;
        margin-bottom: 10px;
      }
.ivu-table-wrapper {
.ivu-table-header{
          background: #141414;
          th{
            color: #fff;
          }
        }
.ivu-table-body {
          td {
            color: #fff;
.ivu-table-cell {
              padding: 10px 10px;
              p.ivu-btn {
                background: transparent;
                height: 25px;
                padding: 0 0px;
                border-radius: 0;
                span {
                  display: inline-block;
                  line-height: 20px;
                  font-size: 12px;
                  padding: 0 15px;
                  letter-spacing: 1px;
                }
              }
              p.ivu-btn.ivu-btn-info {
                border: 1px solid #e2e2e2;
                span {
                  color: #e2e2e2;
                }
              }
              p.ivu-btn.ivu-btn-error {
                border: 1px solid #f15057;
                span {
                  color: #f15057;

                }
              }
              p.ivu-btn.ivu-btn-primary {
                border: 1px solid #00b275;
                border: 1px solid #00b275;
                span {
                  color: #00b275;
                }
              }
              p.ivu-btn.ivu-btn-default {
                border: 1px solid #282828;
                background: #1f1f1f;
                span {
                  color: #464646;
                }
              }
            }
          }
        }
      }
    }
  }
}
</style>
<style scoped>
.ix-money {
  padding: 0;
  color: #c8c8c8;
  background: #000;
  border: 0;
  border-radius: 0;
}
.ix-money-head {
  align-items: flex-end;
  margin: 0 0 14px;
}
.ix-money-head h1 {
  margin: 0 0 7px;
  color: #e8e8e8;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: .04em;
}
.ix-money-kicker,
.ix-money-state-label {
  display: block;
  margin-bottom: 7px;
  color: #707070;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.ix-money-head p,
.ix-money-source {
  margin: 0;
  color: #8a8a8a;
  font-size: 12px;
}
.ix-money-source { margin-bottom: 16px; }
.ix-money-source code { color: #8a8a8a; }
.ix-money-search { flex: 0 1 240px; max-width: 240px; }
.ix-money-search /deep/ .ivu-input {
  height: 30px;
  color: #c8c8c8;
  background: #000;
  border: 1px solid #202020;
  border-radius: 0;
}
.ix-money-session {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 18px 0 8px;
  padding: 9px 0;
  color: #8a8a8a;
  font-size: 11px;
  border-top: 1px solid #202020;
  border-bottom: 1px solid #202020;
}
.ix-money-session strong { color: #e8e8e8; font: 600 12px/1.3 ui-monospace, Menlo, Monaco, Consolas, monospace; }
.ix-money-session-mode { margin-left: auto; color: #707070; text-transform: uppercase; letter-spacing: .08em; }
.ix-money-gate,
.ix-money-state {
  margin: 0;
  padding: 28px 0;
  color: #8a8a8a;
  font-size: 12px;
  line-height: 1.55;
  border-top: 1px solid #202020;
  border-bottom: 1px solid #202020;
}
.ix-money-gate { max-width: 640px; margin-top: 22px; }
.ix-money-gate h2,
.ix-money-state h2 { margin: 0 0 8px; color: #e8e8e8; font-size: 21px; font-weight: 500; line-height: 1.25; }
.ix-money-gate p,
.ix-money-state p { max-width: 620px; margin: 0; }
.ix-money-login {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  margin-top: 20px;
  padding: 0 18px;
  color: #050505;
  background: #e8e8e8;
  border: 1px solid #e8e8e8;
}
.ix-money-state a { display: inline-block; margin-top: 16px; color: #c8c8c8; text-decoration: underline; }
.ix-money-state:focus { outline: 1px solid #606060; outline-offset: -1px; }
.ix-money-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.ix-money-table th {
  padding: 8px 0;
  color: #8a8a8a;
  font: 500 10px/1.3 ui-sans-serif, system-ui, sans-serif;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: .08em;
  border-bottom: 1px solid #202020;
}
.ix-money-table td {
  padding: 10px 0;
  color: #c8c8c8;
  font: 12px/1.3 ui-monospace, Menlo, Monaco, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  border-bottom: 1px solid #141414;
}
@media screen and (max-width: 640px) {
  .ix-money-head { align-items: stretch; flex-direction: column; }
  .ix-money-search { flex: none; width: 100%; max-width: none; }
  .ix-money-source code { display: none; }
  .ix-money-session { align-items: flex-start; flex-wrap: wrap; }
  .ix-money-session strong { flex: 1 1 calc(100% - 90px); overflow-wrap: anywhere; }
  .ix-money-session-mode { flex: 1 1 100%; margin-left: 0; }
  .ix-money-gate,
  .ix-money-state { padding: 22px 0; }
  .ix-money-gate h2,
  .ix-money-state h2 { font-size: 19px; }
  .ix-money-table th:nth-child(3),
  .ix-money-table td:nth-child(3) { text-align: right; }
}
</style>

<style scoped lang="scss">
.nav-right {
  height: auto;
  overflow: hidden;
  padding: 0 0 0 15px;
.rightarea.bill_box {
    padding-left: 15px;
    width: 100%;
    height: auto;
    overflow: hidden;
  }
}

.demo-spin-icon-load{
  animation: ani-demo-spin 1s linear infinite;
}
@media screen and (max-width:768px){
.search{
    display: none;
  }
}


.ix-money {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: #000;
}
.ix-money-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.ix-money-totals {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  min-height: 32px;
}
.ix-money-label {
  font-size: 12px;
  color: var(--ix-text-muted, #8b919a);
  letter-spacing: 0.02em;
}
.ix-money-total {
  font-size: 18px;
  font-weight: 600;
  color: var(--ix-text, #d8e1eb);
  font-variant-numeric: tabular-nums;
}
.ix-money-fiat {
  font-size: 11px;
  color: var(--ix-text-muted, #8b919a);
  font-variant-numeric: tabular-nums;
}
.ix-money-search {
  max-width: 240px;
  flex: 0 1 240px;
}
@media screen and (max-width: 640px) {
  /* This later legacy block used to override the first mobile rule with a
     240px flex-basis. In a column that basis becomes height, leaving a false
     empty panel between search and ledger truth. */
  .ix-money-head {
    align-items: stretch;
  }
  .ix-money-search {
    flex: none;
    width: 100%;
    max-width: none;
  }
}
/* Same dual-book recipe as Exchange.vue — plane honesty. */
.ix-dualbook {
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid rgba(200, 200, 200, 0.35);
  border-radius: 6px;
  background: rgba(200, 200, 200, 0.06);
  color: #c8cdd4;
  font-size: 12.5px;
  line-height: 1.5;
}
.ix-dualbook strong {
  color: #c8c8c8;
  font-weight: 600;
}
.ix-money-table {
  font-variant-numeric: tabular-nums;
}
.ix-empty-error:focus {
  outline: 1px solid var(--ix-orange, #c8c8c8);
  outline-offset: 2px;
}
.ix-empty-loading {
  font-style: italic;
  color: var(--ix-text-muted, #8b919a);
  font-size: 14px;
}
.ix-dim {
  color: var(--ix-text-muted, #8b919a);
  font-size: 14px;
}
</style>
