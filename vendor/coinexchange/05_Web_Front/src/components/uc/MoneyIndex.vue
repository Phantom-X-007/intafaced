<template>
  <div class="nav-rights">
    <div class="nav-right col-xs-12 col-md-10 padding-right-clear">
      <div class="bill_box rightarea padding-right-clear">
        <!-- B3 craft: desk-aligned shell (P21 tokens) — honesty copy preserved. -->
        <div class="ix-money">
          <header class="ix-money-head">
            <div class="ix-money-totals">
              <span class="ix-money-label">{{$t('uc.finance.money.totalassets')}}</span>
              <!--
                NO FIAT TOTAL. Summing assets into one $ figure needs a price
                for each of them, and this platform publishes no rate source —
                our own ticker reports null for every 24h rollup. A total built
                from prices we invented would be the most confident number on
                the page and the only fabricated one.
              -->
              <span class="ix-dim">{{ $t('intafaced.trade.noTotalValue') }}</span>
            </div>
            <Input class="search ix-money-search" search :placeholder="$t('common.searchplaceholder')" @on-change="seachInputChange" v-model="searchKey"/>
          </header>
          <p class="ix-source">{{ $t('intafaced.trade.source') }} · <code>GET /api/v1/account/balance</code></p>
          <p class="ix-dualbook" role="note">
            <strong>{{ $t('intafaced.trade.ledgerNote') }}</strong>
          </p>
          <p
            v-if="walletError"
            class="ix-empty ix-empty-error"
            role="alert"
            tabindex="-1"
            ref="walletError"
          >{{ walletError }}</p>
          <p v-else-if="loading" class="ix-empty ix-empty-loading">Loading balances…</p>
          <p v-else-if="walletReachable && tableMoneyShow.length === 0" class="ix-empty">{{ $t('intafaced.trade.noBalances') }}</p>
          <Table
            v-if="!walletError && !loading && tableMoneyShow.length"
            class="ix-money-table"
            :columns="tableColumnsMoney"
            :data="tableMoneyShow"
            :disabled-hover="true"
          ></Table>
        </div>
      </div>
    </div>
    <!-- The two "match" modals are gone with the flow behind them: they POSTed
         to `/uc/asset/wallet/match` on the retired ucenter and MOVED VALUE.
         Only ledger-client moves value (Doctrine §0.6). -->
  </div>
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
        this.walletReachable = true;
        /* `balances: {}` → no rows. That is the ledger saying this account
           holds nothing, not a fabricated table of every asset at 0.00. */
        this.tableMoney = ixTrade.toBalanceRows(res.data).map(row => ({
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
                border: 1px solid #ff8534;
                span {
                  color: #ff8534;
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
  padding: 12px 14px 18px;
  border: 1px solid var(--ix-border, rgba(255, 255, 255, 0.08));
  border-radius: 10px;
  background: var(--ix-surface, rgba(255, 255, 255, 0.03));
}
.ix-money-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
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
  max-width: 220px;
  flex: 0 1 220px;
}
/* Same dual-book recipe as Exchange.vue — plane honesty. */
.ix-dualbook {
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 107, 0, 0.35);
  border-radius: 6px;
  background: rgba(255, 107, 0, 0.06);
  color: #c8cdd4;
  font-size: 12.5px;
  line-height: 1.5;
}
.ix-dualbook strong {
  color: #ff6b00;
  font-weight: 600;
}
.ix-money-table {
  font-variant-numeric: tabular-nums;
}
.ix-empty-error:focus {
  outline: 1px solid var(--ix-orange, #ff6b00);
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
