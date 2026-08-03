<style scoped>
.ivu-table td,.ivu-table th{
  height: 35px!important;
}
</style>
<template>
  <div class="nav-rights">
    <div class="nav-right">
      <div class="bill_flow_box">
        <div class="rightarea-con">
          <div class="form-group">
            <span>
              {{$t('uc.finance.record.start_end')}}:
            </span>
            <DatePicker v-model="rangeDate" format="yyyy-MM-dd" type="daterange" style="width: 200px;margin-right:30px;" @on-clear="clear"></DatePicker>
            <span>{{$t('uc.finance.record.symbol')}}: </span>
            <Select v-model="symbol" style="width:140px;margin-right:30px;" clearable :placeholder="$t('common.pleaseselect')">
              <Option v-for="item in marketList" :value="item.symbol" :key="item.symbol">{{ item.symbol }}</Option>
            </Select>
            <Button type="warning" @click="queryOrder" style="padding: 6px 30px;margin-left:10px;background-color:#ff6b00;border-color:#ff6b00">{{$t('uc.finance.record.search')}}</Button>
          </div>

          <div class="order-table">
            <p class="ix-source">{{ $t('intafaced.trade.source') }} · <code>GET /api/v1/account/trades</code></p>

            <!--
              WHAT THIS SCREEN CAN AND CANNOT SHOW, SAID UP FRONT.

              The vendor's version listed seventeen kinds of balance movement —
              deposits, withdrawals, transfers, referral awards, dividends, red
              envelopes. Sixteen of them describe flows this platform does not
              have, and the one that remains (trade) is the only one with a real
              record behind it. Rather than keep a type filter whose options all
              return nothing, the screen shows the record that exists and names
              the one that does not.
            -->
            <div class="ix-note" style="margin-bottom:12px;">
              <strong>{{ $t('intafaced.trade.recordScopeTitle') }}</strong>
              <div style="margin-top:6px;">{{ $t('intafaced.trade.recordScopeBody') }}</div>
            </div>

            <p v-if="listError" class="ix-empty ix-empty-error" role="alert" tabindex="-1" ref="listError">{{ listError }}</p>
            <p v-else-if="loading" class="ix-empty ix-empty-loading">Loading fills…</p>
            <p v-else-if="listReachable && tableRecord.length === 0" class="ix-empty">{{ $t('intafaced.trade.noMyTrades') }}</p>
            <Table v-if="!listError && !loading && tableRecord.length" :no-data-text="$t('common.nodata')" :columns="tableColumnsRecord" :data="pagedRecord" :disabled-hover="true"></Table>
            <div style="margin: 10px;overflow: hidden" v-if="!listError && tableRecord.length > pageSize">
              <div style="float: right;">
                <Page :total="total" :pageSize="pageSize" show-total :current="page" @on-change="changePage" id="record_pages"></Page>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script>
/**
 * MY FILLS — `GET /api/v1/account/trades` on svc-trade through svc-edge.
 *
 * Was `POST /uc/asset/transaction/all` on the retired Java ucenter (ADR
 * 2026-08-02, Option B), which read a seventeen-type balance-movement log.
 *
 * WHY THE SCREEN NARROWED RATHER THAN BROKE. Sixteen of those seventeen types
 * — deposit, withdrawal, transfer, referral award, dividend, vote, red envelope
 * — describe flows that do not exist on this platform. There is no endpoint to
 * repoint them at and nothing behind them to report. The honest move is to
 * serve the one record that is real (your fills, from `trade.fills`) and say
 * plainly which record is missing, rather than keep a type dropdown whose every
 * option resolves to an empty table that reads like "you have no deposits"
 * instead of "deposits do not exist here".
 *
 * `symbol` and `since` are REAL server-side filters on this route. The range end
 * is not a parameter and is applied to the rows we hold.
 *
 * Every amount and fee is a decimal string and is printed as one.
 */
import { rest, REASON } from "@/config/intafaced.js";
import ixTrade from "@js/ix-trade.js";

export default {
  components: {},
  data() {
    return {
      loading: true,
      listReachable: false,
      listError: "",
      rangeDate: "",
      symbol: "",
      marketList: [],
      pageSize: 10,
      page: 1,
      total: 0,
      tableRecord: []
    };
  },
  created: function() {
    this.getList();
    this.getMarkets();
  },
  computed: {
    /** The PLATFORM session token. Not the vendored shell login. */
    ixToken() {
      return this.$store.getters.ixToken;
    },
    /** Paging is local — the service answered with one page of fills. */
    pagedRecord() {
      const start = (this.page - 1) * this.pageSize;
      return this.tableRecord.slice(start, start + this.pageSize);
    },
    tableColumnsRecord() {
      const that = this;
      return [
        {
          title: this.$t("uc.finance.record.chargetime"),
          align: "center",
          width: 170,
          render(h, params) {
            return h("span", {}, that.dateform(params.row.time));
          }
        },
        {
          title: this.$t("uc.finance.record.symbol"),
          align: "center",
          key: "symbol"
        },
        {
          title: this.$t("exchange.direction"),
          align: "center",
          width: 80,
          render(h, params) {
            const row = params.row;
            return h(
              "span",
              { attrs: { class: row.direction.toLowerCase() } },
              row.direction === "BUY" ? that.$t("exchange.buyin") : that.$t("exchange.sellout")
            );
          }
        },
        {
          /* Maker or taker. It decides which fee rate applied, so hiding it
             would leave the fee column unexplainable. */
          title: this.$t("intafaced.trade.liquidityColumn"),
          align: "center",
          width: 90,
          render(h, params) {
            return h("span", {}, params.row.liquidity || "—");
          }
        },
        {
          title: this.$t("exchange.price"),
          align: "center",
          render(h, params) {
            return h("span", { attrs: { title: params.row.price } }, that.decimal(params.row.price));
          }
        },
        {
          title: this.$t("uc.finance.record.num"),
          align: "center",
          render(h, params) {
            return h("span", { attrs: { title: params.row.amount } }, that.decimal(params.row.amount));
          }
        },
        {
          title: this.$t("uc.finance.trade.turnover"),
          align: "center",
          render(h, params) {
            return h("span", { attrs: { title: params.row.turnover } }, that.decimal(params.row.turnover));
          }
        },
        {
          /* ONE fee column, not three. The vendor showed "fee due", "fee
             discount" and "fee charged"; our fill record carries the fee that
             was actually charged and the asset it was charged in. Deriving the
             other two from it would be arithmetic we made up. */
          title: this.$t("uc.finance.record.realfee"),
          align: "center",
          render(h, params) {
            const row = params.row;
            const fee = that.decimal(row.fee);
            return h(
              "span",
              { attrs: { title: row.fee } },
              fee === "—" ? fee : fee + (row.feeAsset ? " " + row.feeAsset : "")
            );
          }
        }
      ];
    }
  },
  methods: {
    /** A decimal string, verbatim. Null/absent is unknown and prints as a dash. */
    decimal(value) {
      if (value === null || value === undefined || value === "") return "—";
      return String(value);
    },
    changePage(pageindex) {
      this.page = pageindex;
    },
    queryOrder() {
      this.page = 1;
      this.getList();
    },
    clear() {
      this.rangeDate = "";
    },
    dateform(time) {
      if (time === null || time === undefined || time === "") return "—";
      const date = new Date(Number(time));
      if (isNaN(date.getTime())) return "—";
      const pad = n => (n < 10 ? "0" + n : String(n));
      return (
        date.getFullYear() +
        "-" + pad(date.getMonth() + 1) +
        "-" + pad(date.getDate()) +
        " " + pad(date.getHours()) +
        ":" + pad(date.getMinutes()) +
        ":" + pad(date.getSeconds())
      );
    },

    /** The symbol filter is populated from the venue's own listing table. */
    getMarkets() {
      rest("/markets").then(res => {
        if (!res.ok || !Array.isArray(res.data)) return;
        this.marketList = res.data.map(m => ({ symbol: m.symbol }));
      });
    },

    getList() {
      this.loading = true;
      this.listReachable = false;
      this.listError = "";
      this.tableRecord = [];

      const start = this.rangeDate && this.rangeDate[0] ? new Date(this.rangeDate[0]).getTime() : NaN;
      const query = { limit: 500 };
      if (this.symbol) query.symbol = this.symbol;
      if (!isNaN(start)) query.since = start;

      rest("/account/trades", { token: this.ixToken, query: query }).then(res => {
        this.loading = false;
        if (!res.ok) {
          this.listError = this.refusalCopy(res);
          this.$nextTick(() => {
            const el = this.$refs.listError;
            if (el && typeof el.focus === "function") el.focus();
          });
          return;
        }
        // A 200 with [] is the venue saying "you have none" — a real answer.
        this.listReachable = true;
        this.tableRecord = this.applyEndFilter(ixTrade.toDeskFills(res.data));
        this.total = this.tableRecord.length;
        const maxPage = Math.max(1, Math.ceil(this.total / this.pageSize));
        if (this.page > maxPage) this.page = maxPage;
      });
    },

    /** The range end is not a parameter on this route, so it applies here. */
    applyEndFilter(rows) {
      const end = this.rangeDate && this.rangeDate[1] ? new Date(this.rangeDate[1]).getTime() : NaN;
      if (isNaN(end)) return rows;
      return rows.filter(row => Number(row.time) <= end + 86399999);
    },

    /** Name the refusal. Never collapse a 403 into an empty table. */
    refusalCopy(res) {
      if (res.reason === REASON.UNAUTHORIZED) {
        return "Not signed in to the platform session — your fills are unknown, not empty.";
      }
      if (res.reason === REASON.SCOPE_DENIED) {
        return "This session does not carry the trade:read scope — fills are unknown, not empty.";
      }
      if (res.reason === REASON.UNREACHABLE) {
        return "The venue did not answer — fills are unknown, not empty.";
      }
      if (res.reason === REASON.BAD_SYMBOL) {
        return "That market is not listed on this venue.";
      }
      return (res.message || "The venue refused the request.") + " — fills are unknown, not empty.";
    }
  }
};
</script>
<style scoped lang="scss">
.nav-rights {
.nav-right {
    height: auto;
    overflow: hidden;
    padding: 0 15px;
.bill_flow_box.rightarea-con {
.form-group {
        margin-bottom: 20px;
        text-align: left;
      }
    }
  }
}
</style>
