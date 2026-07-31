
<style lang="scss" scoped>
.entrusthistory {
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
.entrusthistory.ivu-table th,
.entrusthistory.ivu-table td {
  text-align: center;
}
.table.ivu-table-cell-expand {
  color: #00c2a8;
}
</style>



<template>
  <div class="entrusthistory">
    <Form class="form" :model="formItem" :label-width="75" inline>
      <FormItem :label="$t('uc.finance.trade.start_end')">
        <DatePicker type="daterange" v-model="formItem.date" style="width:180px;"></DatePicker>
      </FormItem>
      <FormItem :label="$t('uc.finance.trade.symbol')">
        <Select v-model="formItem.symbol" style="width:100px;" :placeholder="$t('common.pleaseselect')">
          <Option v-for="(item,index) in symbol" :key="index" :value="item.symbol">{{item.symbol}}</Option>
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
        <Button style="margin-left: 8px" @click="handleClear" class="clear_btn">{{$t('uc.finance.trade.clear')}}</Button>
      </FormItem>
    </Form>
    <div class="table">
      <p v-if="ordersError" class="ix-empty ix-empty-error" role="alert" tabindex="-1">{{ ordersError }}</p>
      <p v-else-if="!loading && ordersReachable && orders.length === 0" class="ix-empty">No order history</p>
      <Table v-if="!ordersError" :no-data-text="$t('common.nodata')" :columns="columns" :data="orders" :loading="loading"></Table>
      <div class="page" v-if="!ordersError">
        <Page :total="total" :pageSize="pageSize" :current="pageNo" @on-change="loadDataPage"></Page>
      </div>
    </div>
  </div>
</template>
<script>
var moment = require("moment");
import expandRow from "@components/exchange/expand.vue";

export default {
  components: { expandRow },
  data() {
    const self = this;
    return {
      loading: true,
      ordersReachable: false,
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
            return h("span", {}, self.dateFormat(params.row.time));
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
          title: self.$t("exchange.price"),
          key: "price",
          render(h, params) {
            return h(
              "span",
              {
                attrs: {
                  title: params.row.price
                }
              },
              self.toFloor(params.row.price)
);
          }
        },
        {
          title: self.$t("exchange.num"),
          key: "amount",
          render(h, params) {
            return h(
              "span",
              {
                attrs: {
                  title: params.row.amount
                }
              },
              self.toFloor(params.row.amount)
);
          }
        },
        {
          title: self.$t("exchange.done"),
          key: "tradedAmount",
          render(h, params) {
            return h(
              "span",
              {
                attrs: {
                  title: params.row.tradedAmount
                }
              },
              self.toFloor(params.row.tradedAmount)
);
          }
        },
        {
          title: self.$t("uc.finance.trade.turnover"),
          key: "turnover",
          render(h, params) {
            return h(
              "span",
              {
                attrs: {
                  title: params.row.turnover
                }
              },
              self.toFloor(params.row.turnover)
);
          }
        },
        {
          title: self.$t("exchange.status"),
          key: "status",
          width: 80,
          render: (h, params) => {
            const status = params.row.status;
            if (status == "COMPLETED") {
              return h(
                "span",
                {
                  style: {
                    color: "#00c2a8"
                  }
                },
                self.$t("exchange.finished")
);
            } else if (status == "CANCELED") {
              return h(
                "span",
                {
                  style: {
                    color: "#00c2a8"
                  }
                },
                self.$t("exchange.canceled")
);
            } else {
              return h("span", {}, "--");
            }
          }
        }
      ],
      orders: []
    };
  },
  computed:{
    lang: function() {
      return this.$store.state.lang;
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
    loadDataPage(data) {
      this.pageNo = data;
      this.getHistoryOrder();
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
    getHistoryOrder() {
      // Order history — fail must not look like "no history"
      this.loading = true;
      this.ordersReachable = false;
      this.ordersError = "";
      const { symbol, type, direction, date: rangeDate } = this.formItem,
        startTime = new Date(rangeDate[0]).getTime() || "",
        endTime = new Date(rangeDate[1]).getTime() || "";
      let params = {};
      if (symbol) params.symbol = symbol;
      if (direction) params.direction = direction;
      if (type) params.type = type;
      if (startTime) params.startTime = startTime;
      if (endTime) params.endTime = endTime;
      params.pageNo = this.pageNo;
      params.pageSize = this.pageSize;
      var that = this;
      this.orders = [];
      this.$http
.post(this.host + "/exchange/order/personal/history", params)
.then(response => {
          var resp = response.body;
          let rows = [];
          if (resp && Array.isArray(resp.content)) {
            this.total = resp.totalElements || 0;
            if (resp.content.length > 0) {
              for (var i = 0; i < resp.content.length; i++) {
                var row = resp.content[i];
                row.price =
                  row.type == "MARKET_PRICE"
? that.$t("exchange.marketprice")
: row.price;
                rows.push(row);
              }
            }
            this.orders = rows;
            this.ordersReachable = true;
            this.loading = false;
          } else {
            this.ordersError =
              "Order service did not answer — order history is unknown, not empty.";
            this.loading = false;
          }
        })
        .catch(() => {
          this.ordersError =
            "Order service did not respond — order history is unknown, not empty.";
          this.loading = false;
        });
    },
    getSymbol() {
      this.$http.post(this.host + this.api.market.thumb, {}).then(response => {
        var resp = response.body;
        if (resp && resp.length > 0) {
          this.symbol = resp;
        }
      }).catch(() => {});
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
      this.columns[9].title = this.$t("exchange.status");
    }
  }
};
</script>

