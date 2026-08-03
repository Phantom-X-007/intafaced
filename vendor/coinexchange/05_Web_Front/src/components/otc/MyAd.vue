<template>
  <div class="nav-rights">
    <div class="my_ad_box">
      <div class="add_ad">
        <Button icon="plus-round" @click="publish">{{ $t('otc.myad.post') }}</Button>
      </div>
      <Alert>{{ $t('otc.myad.alert') }}</Alert>
      <div class="order-table">
        <IxState
          :loading="offers.loading"
          :reason="offers.reason"
          :message="offers.message"
          endpoint="/api/p2p/trpc/offers.list"
        >
          <p v-if="!mine.length" class="ix-empty">{{ $t('otc.myad.empty') }}</p>
          <div v-else class="ix-scroll">
            <table class="ix-table tables">
              <thead>
                <tr>
                  <th>{{ $t('otc.myad.type') }}</th>
                  <th>{{ $t('otc.myad.coin') }}</th>
                  <th>{{ $t('otc.price') }}</th>
                  <th>{{ $t('otc.myad.limit') }}</th>
                  <th>{{ $t('otc.myad.remain') }}</th>
                  <th>{{ $t('otc.myad.created') }}</th>
                  <th>{{ $t('otc.myad.operate') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="o in mine" :key="o.id">
                  <td>{{ o.side === 'sell' ? $t('otc.myad.sell') : $t('otc.myad.buy') }}</td>
                  <td>{{ o.asset }}</td>
                  <td class="ix-num">{{ o.price }} {{ o.fiatCurrency }}</td>
                  <td class="ix-num">{{ o.minAmount }} – {{ o.maxAmount }}</td>
                  <td class="ix-num">{{ o.remainingAmount }}</td>
                  <td>{{ o.createdAt | dateFormat }}</td>
                  <td>
                    <a
                      v-if="o.status === 'active'"
                      class="ix-act-danger"
                      @click="askClose(o)"
                    >{{ $t('otc.myad.close') }}</a>
                    <span v-else class="ix-dim">{{ o.status }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p v-if="closeError" class="ix-empty ix-empty-error" role="alert">{{ closeError }}</p>
          <p class="ix-cap-note">{{ $t('otc.myad.editSocket') }}</p>
        </IxState>
      </div>
    </div>

    <Modal v-model="confirmClose" :title="$t('otc.chat.tip')" @on-ok="doClose">
      <p style="font-weight:600;">{{ $t('otc.myad.closeConfirm') }}</p>
    </Modal>
  </div>
</template>

<style scoped lang="scss">
.nav-rights {
  padding: 0 0 0 20px;
.my_ad_box {
.add_ad {
      margin-bottom: 20px;
.ivu-btn {
        background: #00c2a8;
        color: #fff;
        &:hover {
          border-color: #00c2a8;
        }
      }
    }
.ivu-alert.ivu-alert-info {
      border: none;
      background-color: #000000;
      text-align: center;
    }
  }
}
</style>
<style lang="scss">
.nav-rights {
.my_ad_box {
.order-table {
.ivu-table {
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
.ivu-table-body {
.ivu-table-tbody.ivu-table-row.ivu-table-cell {
            button.ivu-btn {
              border-radius: 10px;
              background: #fff;
            }
            button.ivu-btn.ivu-btn-default {
              border:1px solid #00b275;
              background-color: transparent;
              span {
                color: #00b275;
              }
            }
            button.ivu-btn.ivu-btn-primary {
              border:1px solid #1ad4bc;
              background-color: transparent;
              span {
                color: #1ad4bc;
              }
            }
            button.ivu-btn.ivu-btn-error {
              border:1px solid #f15057;
              background-color: transparent;
              span {
                color: #f15057;
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
.ix-act-danger {
  color: var(--ix-down, #f15057);
  cursor: pointer;
  font-weight: 600;
}
.ix-dim {
  color: var(--ix-text-faint, #6b7280);
}
.ix-cap-note {
  margin: 10px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--ix-text-faint, #6b7280);
  border-left: 2px solid var(--ix-orange, #ff8a1f);
  padding-left: 10px;
}
</style>

<script>
/**
 * MY OFFERS — svc-p2p `offers.list`, filtered to the caller, plus `offers.close`.
 *
 * WHY THE FILTER IS CLIENT-SIDE. `offers.list` accepts `{ asset, fiatCurrency,
 * side, limit }` and has no `makerId` filter — it is the public book. So the
 * caller's own id is read from the access token and the list is narrowed here.
 * That is a real inefficiency and worth naming: with more than 200 offers in the
 * book, a maker's own offer could fall outside the window and silently vanish
 * from this screen. A `mine` filter on the procedure is the fix.
 *
 * WHAT "DELETE" AND "EDIT" BECAME. The vendor offered edit, shelf, drop-off and
 * delete against `/otc/advertise/*`. svc-p2p has exactly one mutation on an
 * offer besides create: `offers.close`, which is terminal — the status enum is
 * `active | paused | closed` and nothing transitions back out of `closed`. There
 * is no update, no pause and no delete. So this screen offers close, calls it
 * close, and states the rest as missing rather than wiring four buttons to one
 * endpoint and hoping nobody notices which is which.
 *
 * MONEY. Decimal strings in, decimal strings rendered.
 */
import IxState from "../intafaced/IxState.vue";
import ixModule from "../intafaced/module-mixin.js";
import { query, mutate, subjectOf } from "../../config/intafaced.js";

var LIST_LIMIT = 200;

export default {
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      offers: this.emptySection(),
      confirmClose: false,
      closing: null,
      closeError: ""
    };
  },
  computed: {
    lang: function () {
      return this.$store.state.lang;
    },
    myId: function () {
      return subjectOf(this.ixToken);
    },
    mine: function () {
      var me = this.myId;
      var rows = this.offers.data || [];
      if (!me) return [];
      return rows.filter(function (o) {
        return o.makerId === me;
      });
    }
  },
  methods: {
    getAd() {
      this.load("offers", query("p2p", "offers.list", { limit: LIST_LIMIT }, this.ixToken));
    },
    askClose(offer) {
      this.closing = offer;
      this.closeError = "";
      this.confirmClose = true;
    },
    doClose() {
      var self = this;
      if (!this.closing) return;
      mutate("p2p", "offers.close", { offerId: this.closing.id }, this.ixToken).then(function (res) {
        self.closing = null;
        if (!res.ok) {
          self.closeError = res.message;
          return;
        }
        self.getAd();
      });
    },
    publish() {
      this.$router.push("/uc/ad/create");
    }
  },
  created() {
    this.getAd();
  }
};
</script>
