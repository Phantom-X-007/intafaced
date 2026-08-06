<template>
  <div class="nav-rights">
    <div class="nav-right">
      <div class="bill_box_order">
        <div class="order_box">
          <IxState
            :loading="trades.loading"
            :reason="trades.reason"
            :message="trades.message"
            endpoint="/api/p2p/trpc/trades.list"
          >
            <Tabs :value="tab" v-model="tab">
              <TabPane v-for="p in panes" :key="p.name" :label="p.label" :name="p.name">
                <div class="order-table">
                  <p v-if="!visible.length" class="ix-empty">{{ $t('uc.otcorder.emptyTab') }}</p>
                  <div v-else class="ix-scroll">
                    <table class="ix-table">
                      <thead>
                        <tr>
                          <th>{{ $t('uc.otcorder.created') }}</th>
                          <th>{{ $t('otc.side') }}</th>
                          <th>{{ $t('otc.asset') }}</th>
                          <th>{{ $t('otc.tradeinfo.num') }}</th>
                          <th>{{ $t('otc.tradeinfo.price') }}</th>
                          <th>{{ $t('otc.chat.transmoney') }}</th>
                          <th>{{ $t('uc.otcorder.status') }}</th>
                          <th>{{ $t('otc.operate') }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="tr in visible" :key="tr.id">
                          <td>{{ tr.createdAt | dateFormat }}</td>
                          <td>{{ sideOf(tr) }}</td>
                          <td>{{ tr.asset }}</td>
                          <td class="ix-num">{{ tr.amount }}</td>
                          <td class="ix-num">{{ tr.price }} {{ tr.fiatCurrency }}</td>
                          <td class="ix-num">{{ tr.fiatAmount }} {{ tr.fiatCurrency }}</td>
                          <td>{{ $t('otc.chat.state.' + tr.status) }}</td>
                          <td>
                            <router-link :to="'/chat?tradeId=' + tr.id" class="ix-act">
                              {{ $t('otc.moredetail') }}
                            </router-link>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabPane>
            </Tabs>
            <p class="ix-cap-note">{{ $t('uc.otcorder.listCap') }}</p>
          </IxState>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bill_box_order {
  width: 99%;
  padding-left: 20px;
  height: auto;
  margin: 0 auto;
  /* overflow: hidden; */
}

.order_box {
  text-align: left;
}

.order_box a {
  color: #0b0d1b;
  font-size: 16px;
  padding: 0 30px;
  cursor: pointer;
  text-decoration: none;
  text-align: center;
  line-height: 54px;
  display: inline-block;
}

.order_box.active {
  border-bottom: 2px solid #ff6b00;
}

.order_box.search {
  position: absolute;
  width: 300px;
  height: 32px;
  top: 12px;
  right: 0;
  display: flex;
}
</style>

<style lang="scss">
.bill_box_order {
.order_box {
.ivu-tabs {
      // overflow:initial;
      color:#fff;
.ivu-tabs-content.ivu-tabs-content-animated {
.ivu-tabs-tabpane {
.ivu-table-wrapper {
            border: none;
            box-shadow: none;
            a {
              color: #ff6b00;
            }
          }
        }
      }
.ivu-tabs-bar {
        border-color:#262626!important;
.ivu-tabs-nav-container {
.ivu-tabs-nav-scroll {
.ivu-tabs-ink-bar.ivu-tabs-ink-bar-animated {
              background-color: #ff6b00;
            }
.ivu-tabs-tab.ivu-tabs-tab-active.ivu-tabs-tab-focused {
              color: #ff6b00;
              &:hover {
                color: #ff6b00;
              }
            }
.ivu-tabs-tab {
              &:hover {
                color: #ff6b00;
              }
            }
          }
        }
      }
.ivu-tabs-content {
.ivu-tabs-tabpane {
.ivu-table-header,
.ivu-table-body {
            table {
              width: 100%!important;
              thead {
.ivu-table-cell {
                  padding: 0;
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
.ix-num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ix-act {
  color: var(--ix-orange, #ff8a1f);
}
.ix-cap-note {
  margin: 10px;
  font-size: 11.5px;
  color: var(--ix-text-faint, #6b7280);
}
</style>

<script>
/**
 * MY OTC TRADES — svc-p2p `trades.list`.
 *
 * `trades.list` returns the caller's own trades: svc-p2p reads the user id from
 * the principal, so there is no userId input and no way to ask for somebody
 * else's. That is also why this screen has no "signed out" branch of its own —
 * without a session the procedure answers UNAUTHORIZED and IxState renders it
 * with a route to sign in.
 *
 * TABS ARE CLIENT-SIDE, and deliberately so. `trades.list` takes only `limit` —
 * it cannot filter by status. The vendor's five tabs each re-queried the Java
 * backend with a status code. Here one read is partitioned by the state names
 * the service returned, so the tab counts and the rows can never disagree with
 * each other. The cost is the 200-row cap, which is stated on screen rather
 * than hidden behind a pager over a total nobody reports.
 *
 * The vendor's "appealing" tab maps to `disputed`, and its "unpaid"/"paid" split
 * maps to `escrowed`/`fiat_sent`. `created` is a state the vendor had no tab for
 * at all — a trade whose escrow lock has not yet completed — so it is grouped
 * with the live ones rather than being dropped, which is what a five-tab layout
 * over six states would otherwise do.
 *
 * MONEY. `amount`, `price` and `fiatAmount` are printed as the decimal strings
 * they arrive as.
 */
import IxState from "../intafaced/IxState.vue";
import ixModule from "../intafaced/module-mixin.js";
import { query, subjectOf } from "../../config/intafaced.js";

var LIST_LIMIT = 200;

export default {
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      trades: this.emptySection(),
      tab: "live"
    };
  },
  computed: {
    panes: function () {
      return [
        { name: "live", label: this.$t("uc.otcorder.unpaid") },
        { name: "sent", label: this.$t("uc.otcorder.paided") },
        { name: "done", label: this.$t("uc.otcorder.finished") },
        { name: "cancelled", label: this.$t("uc.otcorder.canceled") },
        { name: "disputed", label: this.$t("uc.otcorder.appealing") }
      ];
    },
    rows: function () {
      return this.trades.data || [];
    },
    visible: function () {
      var tab = this.tab;
      return this.rows.filter(function (t) {
        if (tab === "live") return t.status === "created" || t.status === "escrowed";
        if (tab === "sent") return t.status === "fiat_sent";
        if (tab === "done") return t.status === "released";
        if (tab === "cancelled") return t.status === "cancelled";
        if (tab === "disputed") return t.status === "disputed";
        return false;
      });
    },
    myId: function () {
      return subjectOf(this.ixToken);
    }
  },
  methods: {
    /** Which side of this trade the reader is on. Buyer and seller are named on it. */
    sideOf(trade) {
      if (!this.myId) return "—";
      return trade.buyerId === this.myId ? this.$t("otc.buyin") : this.$t("otc.sellout");
    }
  },
  created() {
    this.load("trades", query("p2p", "trades.list", { limit: LIST_LIMIT }, this.ixToken));
  }
};
</script>
