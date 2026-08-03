

<style lang="scss" scoped>
.entrustcurrent {
  float: left;
  width: 100%;
  padding-left: 30px;
}

.page {
  text-align: right;
  margin-top: 20px;
}
.table {
  border-radius: 4px;
}
.table.ivu-table-wrapper {
  position: relative;
  /* border: 1px solid #dddee1; */
  border-bottom: 0;
  border-right: 0;
  // box-shadow: 0 0 2px #ccc;
  border-radius: 4px;
  // overflow: hidden;
}
.form.ivu-form-inline.ivu-form-item {
  display: inline-block;
}
</style>
<style lang="scss">
.entrustcurrent.ivu-table th,
.entrustcurrent.ivu-table td {
  text-align: center;
}
.table.ivu-table-cell-expand {
  color: #00c2a8;
}
</style>

<template>
  <div class="entrustcurrent">
    <Form class="form" :model="formItem" :label-width="75" inline>
      <FormItem :label="$t('uc.finance.trade.start_end')">
        <DatePicker type="daterange" v-model="formItem.date" style="width:180px;"></DatePicker>
      </FormItem>
      <FormItem :label="$t('uc.finance.trade.symbol')">
        <Select v-model="formItem.symbol" style="width:100px;" :placeholder="$t('common.pleaseselect')">
          <Option v-for="(item,index) in symbol " :value="item.symbol " :key="index">{{item.symbol}}</Option>
        </Select>
      </FormItem>
      <FormItem :label="$t('uc.finance.trade.type')">
        <Select v-model="formItem.type" style="width:70px;" :placeholder="$t('common.pleaseselect')">
          <Option value="LIMIT_PRICE">{{$t('uc.finance.trade.limit')}}</Option>
          <Option value="MARKET_PRICE">{{$t('uc.finance.trade.market')}}</Option>
        </Select>
      </FormItem>
      <FormItem :label="$t('uc.finance.trade.direction')">
        <Select v-model="formItem.direction" style="width:70px;" :placeholder="$t('common.pleaseselect')">
          <Option value="0">{{$t('uc.finance.trade.buy')}}</Option>
          <Option value="1">{{$t('uc.finance.trade.sell')}}</Option>
        </Select>
      </FormItem>
      <FormItem>
        <Button type="warning" @click="handleSubmit">{{$t('uc.finance.trade.search')}}</Button>
        <Button style="margin-left: 8px " @click="handleClear " class="clear_btn">{{$t('uc.finance.trade.clear')}}</Button>
      </FormItem>
    </Form>
    <div class="table">
      <p class="ix-source">{{ $t('intafaced.trade.source') }} · <code>GET /api/v1/orders/open</code></p>
      <p v-if="ordersError" class="ix-empty ix-empty-error" role="alert" tabindex="-1">{{ ordersError }}</p>
      <p v-else-if="loading" class="ix-empty ix-empty-loading">Loading open orders…</p>
      <p v-else-if="ordersReachable && orders.length === 0" class="ix-empty">{{ $t('intafaced.trade.noOpenOrders') }}</p>
      <Table v-if="!ordersError && !loading && orders.length" :no-data-text="$t('common.nodata')" :columns="columns " :data="pagedOrders"></Table>
      <div class="page" v-if="!ordersError && orders.length > pageSize">
        <Page :total="total" :pageSize="pageSize" :current="pageNo" @on-change="loadDataPage"></Page>
      </div>
    </div>
  </div>
</template>
<script>
/**
 * OPEN ORDERS — `GET /api/v1/orders/open` on svc-trade through svc-edge.
 *
 * Was `POST /exchange/order/personal/current` on the retired Java exchange
 * (ADR 2026-08-02, Option B). Presentation is unchanged; only the wire moved.
 *
 * FILTERING IS CLIENT-SIDE, AND THAT IS THE HONEST CHOICE HERE. `/orders/open`
 * takes only `?symbol=` — it has no `since`, no type and no side parameter,
 * because an open-order set is small by definition and the service returns all
 * of it. So the date/type/direction controls filter the rows we already hold.
 * The alternative was to keep sending parameters the service ignores, which
 * would show a filtered-looking table that was never filtered.
 *
 * The session that matters here is the PLATFORM session (`ixToken`), not the
 * vendored shell login. They are different sessions and this screen says so
 * rather than showing an empty table to someone who is signed in to the shell.
 */
var moment = require("moment");
import expandRow from "@components/exchange/expand.vue";
import { rest, REASON } from "@/config/intafaced.js";
import ixTrade from "@js/ix-trade.js";

export default {
  components: { expandRow },
  data() {
    const self = this;
    return {
      loading: true,
      ordersReachable: false,
      cancellingId: null,
      ordersError: "",
      pageSize: 10,
      pageNo: 1,
      total: 0,
      symbol: [],
      formItem: {
        symbol: "",
        type: "",
        direction: "",
        date: ""
      },
      columns: [
        {
          type: "index",
          width: 30,
          render: (h, params) => {
            return h(expandRow, {
              props: {
                skin: params.row.skin,
                rows: params.row.detail
              }
            });
          }
        },
        {
          title: self.$t("exchange.time"),
          key: "time",
          minWidth: 55,
          render: (h, params) => {
            return h("span", {}, this.dateFormat(params.row.time));
          }
        },
        {
          title: self.$t("uc.finance.trade.symbol"),
          width: 130,
          key: "symbol"
        },
        {
          title: self.$t("uc.finance.trade.type"),
          width: 70,
          render(h, params) {
            return h(
              "span",
              params.row.type === "LIMIT_PRICE"? self.$t("exchange.limited_price"): self.$t("exchange.market_price")
);
          }
        },
        {
          title: self.$t("exchange.direction"),
          key: "direction",
          width: 90,
          render: (h, params) => {
            const row = params.row;
            const className = row.direction.toLowerCase();
            return h(
              "span",
              {
                attrs: {
                  class: className
                }
              },
              row.direction == "BUY"
? self.$t("exchange.buyin")
: self.$t("exchange.sellout")
);
          }
        },
        {
          /* A market order has no price. Rendering it through toFloor() would
             print "0", which reads as a real limit price of zero. */
          title: self.$t("exchange.price"),
          key: "price",
          render(h, params) {
            const row = params.row;
            if (row.type === "MARKET_PRICE") {
              return h("span", {}, self.$t("exchange.marketprice"));
            }
            return h("span", { attrs: { title: row.price } }, self.decimal(row.price));
          }
        },
        {
          title: self.$t("exchange.num"),
          key: "amount",
          render(h, params) {
            return h(
              "span",
              { attrs: { title: params.row.amount } },
              self.decimal(params.row.amount)
            );
          }
        },
        {
          title: self.$t("exchange.traded"),
          key: "tradedAmount",
          render(h, params) {
            return h(
              "span",
              { attrs: { title: params.row.tradedAmount } },
              self.decimal(params.row.tradedAmount)
            );
          }
        },
        {
          /* `cost` is null when the venue cannot say what quote actually moved.
             Null prints as a dash — "unknown" is not "nothing". */
          title: self.$t("uc.finance.trade.turnover"),
          key: "turnover",
          render(h, params) {
            return h(
              "span",
              { attrs: { title: params.row.turnover } },
              self.decimal(params.row.turnover)
            );
          }
        },
        {
          title: self.$t("exchange.action"),
          key: "operate",
          width: 110,
          render: (h, params) => {
            return h(
              "Button",
              {
                props: {
                  size: "small"
                },
                style: {
                  border: "1px solid #1ad4bc",
                  color: "#f1ac19",
                  "line-height": "1.2",
                  "border-radius": "10px"
                },
                on: {
                  click: () => {
                    // console.log("======")
                    self.cancel(params.row.orderId);
                  }
                }
              },
              self.$t("exchange.undo")
);
          }
        }
      ],
      orders: []
    };
  },
  computed:{
    lang: function() {
      return this.$store.state.lang;
    },
    /** The PLATFORM session token. Not the vendored shell login. */
    ixToken: function() {
      return this.$store.getters.ixToken;
    },
    /** Client-side page over rows we already hold in full. */
    pagedOrders: function() {
      var start = (this.pageNo - 1) * this.pageSize;
      return this.orders.slice(start, start + this.pageSize);
    }
  },
  watch: {
    lang: function() {
      this.updateLangData();
    }
  },
  created() {
    this.getHistoryOrder();
    this.getSymbol();
  },
  methods: {
    dateFormat: function(tick) {
      return moment(tick).format("YYYY-MM-DD HH:mm:ss");
    },
    timeFormat: function(tick) {
      return moment(tick).format("HH:mm:ss");
    },
    /* Paging is local — the service returned every open order in one answer. */
    loadDataPage(data) {
      this.pageNo = data;
    },
    handleSubmit() {
      this.pageNo = 1;
      this.getHistoryOrder();
    },
    handleClear() {
      this.formItem = {
        symbol: "",
        type: "",
        direction: "",
        date: ""
      };
    },
    /** A decimal string, verbatim. Null/absent is unknown and prints as a dash. */
    decimal(value) {
      if (value === null || value === undefined || value === "") return "—";
      return String(value);
    },

    getHistoryOrder() {
      // An unreachable venue must never look like "no open orders".
      this.loading = true;
      this.ordersReachable = false;
      this.ordersError = "";
      this.orders = [];

      const symbol = this.formItem.symbol;
      rest("/orders/open", {
        token: this.ixToken,
        query: symbol ? { symbol: symbol } : null
      }).then(res => {
        this.loading = false;
        if (!res.ok) {
          this.ordersError = this.refusalCopy(res);
          return;
        }
        // A 200 with [] is the venue saying "you have none" — a real answer.
        this.ordersReachable = true;
        this.orders = this.applyFilters(ixTrade.toDeskOrders(res.data));
        this.total = this.orders.length;
        const maxPage = Math.max(1, Math.ceil(this.total / this.pageSize));
        if (this.pageNo > maxPage) this.pageNo = maxPage;
      });
    },

    /**
     * The controls `/orders/open` cannot express, applied to rows we hold in
     * full. Filtering here rather than pretending the service did it.
     */
    applyFilters(rows) {
      const { type, direction, date: rangeDate } = this.formItem;
      const start = rangeDate && rangeDate[0] ? new Date(rangeDate[0]).getTime() : NaN;
      const end = rangeDate && rangeDate[1] ? new Date(rangeDate[1]).getTime() : NaN;
      const wantSide = direction === "0" ? "BUY" : direction === "1" ? "SELL" : "";
      return rows.filter(row => {
        if (type && row.type !== type) return false;
        if (wantSide && row.direction !== wantSide) return false;
        if (!isNaN(start) && Number(row.time) < start) return false;
        // The picker gives midnight; include the whole end day.
        if (!isNaN(end) && Number(row.time) > end + 86399999) return false;
        return true;
      });
    },

    /** Name the refusal. Never collapse a 403 into an empty table. */
    refusalCopy(res) {
      if (res.reason === REASON.UNAUTHORIZED) {
        return "Not signed in to the platform session — your open orders are unknown, not empty.";
      }
      if (res.reason === REASON.SCOPE_DENIED) {
        return "This session does not carry the trade:read scope — open orders are unknown, not empty.";
      }
      if (res.reason === REASON.UNREACHABLE) {
        return "The venue did not answer — open orders are unknown, not empty.";
      }
      if (res.reason === REASON.BAD_SYMBOL) {
        return "That market is not listed on this venue.";
      }
      return (res.message || "The venue refused the request.") +
        " — open orders are unknown, not empty.";
    },

    /** Symbols come from the venue's own listing table. */
    getSymbol() {
      rest("/markets").then(res => {
        if (!res.ok || !Array.isArray(res.data)) {
          // Leave prior symbols; never invent pairs.
          if (!this.symbol || !this.symbol.length) {
            this.$Message.error("Market list unavailable — symbols unknown, not empty.");
          }
          return;
        }
        this.symbol = res.data.map(m => ({ symbol: m.symbol }));
      });
    },

    cancel(orderId) {
      if (this.cancellingId) return;
      this.$Modal.confirm({
        content: this.$t("exchange.undotip"),
        onOk: () => {
          if (this.cancellingId) return;
          this.cancellingId = orderId;
          rest("/orders/" + encodeURIComponent(orderId), {
            method: "DELETE",
            token: this.ixToken
          }).then(res => {
            this.cancellingId = null;
            if (res.ok) {
              this.$Notice.success({
                title: this.$t("exchange.tip"),
                desc: this.$t("intafaced.trade.cancelled")
              });
              this.getHistoryOrder();
              return;
            }
            this.$Notice.error({
              title: this.$t("exchange.tip"),
              desc: ixTrade.orderFailureMessage(res, "cancel")
            });
          });
        }
      });
    },
    updateLangData(){
      this.columns[1].title = this.$t("exchange.time");
      this.columns[2].title = this.$t("uc.finance.trade.symbol");
      this.columns[3].title = this.$t("uc.finance.trade.type");
      this.columns[4].title = this.$t("exchange.direction");
      this.columns[5].title = this.$t("exchange.price");
      this.columns[6].title = this.$t("exchange.num");
      this.columns[7].title = this.$t("exchange.traded");
      this.columns[8].title = this.$t("uc.finance.trade.turnover");
      this.columns[9].title = this.$t("exchange.action");
    }
  }
};
</script>

