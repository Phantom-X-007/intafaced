<template>
  <div class="nav-rights">
    <div class="nav-right col-xs-12 col-md-10 padding-right-clear">
      <div class="bill_box rightarea padding-right-clear">
        <section class="trade-group merchant-top">
            <i class="merchant-icon tips"></i>
            <span class="tips-word">{{$t('uc.mining.title')}}</span>
        </section>
        <div class="shaow">
          <div class="money_table mining-list">
            <p v-if="loading" class="ix-empty-loading" role="status">Loading mining positions…</p>
            <p v-else-if="listError" class="ix-empty ix-empty-error" role="alert">{{ listError }}</p>
            <Row v-else>
                <Col span="24" v-if="listReachable && miningList.length == 0" style="text-align:center;margin-top: 30px;">
                  {{$t('uc.mining.empty')}}
                </Col>
                <Col :xs="24" :sm="24" :md="8" :lg="8" v-for="item in miningList" :key="item.id || item.title">
                  <Card style="width:100%;position:relative;">
                    <div style="width: 100%;min-height: 58px;">
                      <div style="float:left;"><img style="width:50px;height:50px;border-radius:50px;" :src="item.image"></div>
                      <div style="float:left;text-align:left;margin-left: 15px;">
                        <h2>{{item.title}}</h2>
                        <p><span v-if="item.miningStatus == 0" style="font-size:12px;padding: 2px 8px;border-radius:10px;background:#FF0000;">{{$t('uc.mining.status0')}}</span></p>
                        <p><span v-if="item.miningStatus == 1" style="font-size:12px;padding: 2px 8px;border-radius:10px;background:#00b275;">{{$t('uc.mining.status1')}}</span></p>
                        <p><span v-if="item.miningStatus == 2" style="font-size:12px;padding: 2px 8px;border-radius:10px;background:#888;">{{$t('uc.mining.status2')}}</span></p>
                      </div>
                    </div>
                    <div style="width:100%;padding: 5px 10px;background: #000;border-radius: 5px;">
                      <table class="config-table">
                        <tr>
                            <td>{{$t('uc.mining.miningUnit')}}</td><td>{{item.miningUnit}}</td>
                            <td>{{$t('uc.mining.miningPeriod')}}</td>
                            <td v-if="item.period == 0">{{$t('uc.mining.day')}}</td>
                            <td v-if="item.period == 1">{{$t('uc.mining.week')}}</td>
                            <td v-if="item.period == 2">{{$t('uc.mining.month')}}</td>
                            <td v-if="item.period == 3">{{$t('uc.mining.year')}}</td>
                        </tr>
                        <tr>
                            <td>{{$t('uc.mining.miningDays')}}</td>
                            <td>{{item.miningDays}}
                                <span v-if="item.period==0">{{$t('uc.mining.day')}}</span>
                                <span v-if="item.period==1">{{$t('uc.mining.week')}}</span>
                                <span v-if="item.period==2">{{$t('uc.mining.month')}}</span>
                                <span v-if="item.period==3">{{$t('uc.mining.year')}}</span>
                            </td>
                            <td>{{$t('uc.mining.miningedDays')}}</td>
                            <td>{{item.miningedDays}}
                                <span v-if="item.period==0">{{$t('uc.mining.day')}}</span>
                                <span v-if="item.period==1">{{$t('uc.mining.week')}}</span>
                                <span v-if="item.period==2">{{$t('uc.mining.month')}}</span>
                                <span v-if="item.period==3">{{$t('uc.mining.year')}}</span>
                            </td>
                        </tr>
                        <tr>
                            <td>{{$t('uc.mining.miningDaysProfit')}}</td>
                            <td>{{item.miningDaysprofit}} {{item.miningUnit}}/
                                <span v-if="item.period==0">{{$t('uc.mining.day')}}</span>
                                <span v-if="item.period==1">{{$t('uc.mining.week')}}</span>
                                <span v-if="item.period==2">{{$t('uc.mining.month')}}</span>
                                <span v-if="item.period==3">{{$t('uc.mining.year')}}</span>
                            </td>
                            <td>{{$t('uc.mining.miningCurrentDaysProfit')}}</td>
                            <td>{{item.currentDaysprofit}} {{item.miningUnit}}/
                                <span v-if="item.period==0">{{$t('uc.mining.day')}}</span>
                                <span v-if="item.period==1">{{$t('uc.mining.week')}}</span>
                                <span v-if="item.period==2">{{$t('uc.mining.month')}}</span>
                                <span v-if="item.period==3">{{$t('uc.mining.year')}}</span>
                            </td>
                          </tr>
                      </table>
                    </div>
                    <div style="font-size:12px;margin-top: 10px;text-align:left;color: #8a8a8a;" v-if="item.miningInvite > 0">
                    <Icon type="ios-information-circle" /> {{$t('uc.mining.invitetip1')}}{{item.miningInvite | percentFun}}{{$t('uc.mining.invitetip2')}}{{item.miningInvitelimit | percentFun}}%</div>
                  </Card>
                </Col>
            </Row>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script>
export default {
  components: {},
  data() {
    return {
      loginmsg: this.$t("common.logintip"),
      total: 0,
      pageSize: 10,
      loading: true,
      listReachable: false,
      listError: "",
      pageNo: 1,
      miningList: []
    };
  },
  methods: {
    getMyMiningList() {
      this.loading = true;
      this.listReachable = false;
      this.listError = "";
      let params = {};
      params.pageNo = this.pageNo;
      params.pageSize = this.pageSize;
      this.$http.post(this.host + this.api.uc.myInnovationMinings, params).then(response => {
        var resp = response.body;
        if (resp && resp.code == 0 && resp.data) {
          this.miningList = resp.data.content || [];
          this.listReachable = true;
        } else {
          this.miningList = [];
          this.listError = "Mining positions did not answer — list is unknown, not empty.";
          this.$Message.error(this.loginmsg);
        }
        this.loading = false;
      }).catch(() => {
        this.miningList = [];
        this.listError = "Mining service did not respond — list is unknown, not empty.";
        this.loading = false;
      });
    },
    loadDataPage(data){
      this.pageNo = data;
      this.getMyMiningList();
    }
  },
  created() {
    this.getMyMiningList();
  },
  filters: {
    percentFun: function(value){
      var tem = value * 100;
      return tem.toFixed(0);
    }
  },
  computed: {
    tableColumns() {
      let self = this;
      let columns = [];
      columns.push({
        title: this.$t("uc.activity.mColumn1"),
        key: "image",
        align: "center"
      });
      columns.push({
        title: this.$t("uc.activity.mColumn2"),
        key: "title",
        align: "center"
      });
      columns.push({
        title: this.$t("uc.activity.mColumn3"),
        key: "miningUnit",
        align: "center"
      });
      columns.push({
        title: this.$t("uc.activity.mColumn4"),
        key: "period",
        align: "center",
        render(h, params) {
          let text = "";
          if(params.row.period == 1){
            text = "w";
          }
          if(params.row.period == 2){
            text = "-";
          }
          if(params.row.period == 3){
            text = "-";
          }
          return h(
            "span",{}, text
);
        }
      });
      columns.push({
        title: this.$t("uc.activity.mColumn5"),
        key: "miningDays",
        align: "center"
      });
      columns.push({
        title: this.$t("uc.activity.mColumn6"),
        key: "miningedDays",
        align: "center"
      });
      columns.push({
        title: this.$t("uc.activity.mColumn7"),
        key: "miningStatus",
        align: "center",
        render(h, params) {
          let text = "Deployed";
          if(params.row.miningStatus == 1){
            text = "Mining";
          }
          if(params.row.miningStatus == 2){
            text = "Ended";
          }
          return h(
            "span",{}, text
);
        }
      });
      columns.push({
        title: this.$t("uc.activity.mColumn8"),
        key: "miningDaysprofit",
        align: "center",
        width: 100,
        render(h, params) {
          return h(
            "span",{}, params.row.miningDaysprofit + " " + params.row.miningUnit
);
        }
      });
      columns.push({
        title: this.$t("uc.activity.mColumn9"),
        key: "currentDaysprofit",
        align: "center",
        width: 100,
        render(h, params) {
          return h(
            "span",{}, params.row.currentDaysprofit + " " + params.row.miningUnit
);
        }
      });
      columns.push({
        title: this.$t("uc.activity.mColumn10"),
        key: "totalProfit",
        align: "center",
        width: 100
      });
      columns.push({
        title: this.$t("uc.activity.mColumn11"),
        key: "endTime",
        align: "center",
        width: 140
      });
      columns.push({
        title: this.$t("uc.activity.mColumn12"),
        key: "createTime",
        align: "center",
        width: 140
      });
      return columns;
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
.ivu-btn {
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
.ivu-btn.ivu-btn-info {
                border: 1px solid #1ad4bc;
                span {
                  color: #1ad4bc;
                }
              }
.ivu-btn.ivu-btn-error {
                border: 1px solid #f15057;
                span {
                  color: #f15057;
                }
              }
.ivu-btn.ivu-btn-primary {
                border: 1px solid #00b275;
                border: 1px solid #00b275;
                span {
                  color: #00b275;
                }
              }
.ivu-btn.ivu-btn-default {
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
    padding-right: 15px;
    width: 100%;
    height: auto;
    overflow: hidden;
  }
}

.demo-spin-icon-load{
  animation: ani-demo-spin 1s linear infinite;
}

.header-btn{
  float:right;padding: 5px 15px;border: 1px solid #1ad4bc;color: #1ad4bc;
  margin-left: 20px;
  &:hover{
    background: #1ad4bc;
    color: #000;
    cursor: pointer;
  }
}
.mining-list.ivu-row.ivu-col.ivu-card{
  background: #2c2c2c;
}

.mining-list.ivu-row.ivu-col.ivu-card-bordered{
  border: none!important;
}
.config-table{
  width:100%;
  tr{
    td{
      color: #8a8a8a;
      font-size: 12px;
      &:nth-child(1){
        text-align:left;
      }
      &:nth-child(2){
        text-align:right;
        padding-right: 10px;
        color: #EEE;
      }
      &:nth-child(3){
        text-align:left;
        padding-left: 10px;
      }
      &:nth-child(4){
        text-align:right;
        color: #EEE;
      }
    }
  }
}

.merchant-top {
    height: 50px;
    display: -webkit-box;
    display: -ms-flexbox;
    display: flex;
    -webkit-box-align: center;
    -ms-flex-align: center;
    align-items: center;
    padding: 0 15px;
}

.trade-group {
    margin-bottom: 20px;
    font-size: 14px;
}

.merchant-icon {
    display: inline-block;
    margin-left: 4px;
    background-size: 100% 100%;
}

.merchant-top.tips-word {
    -webkit-box-flex: 2;
    -ms-flex-positive: 2;
    flex-grow: 2;
    text-align: left;
}

.merchant-icon.tips {
    width: 4px;
    height: 22px;
    margin-right: 10px;
    background: #00c2a8;
}

.bill_box {
    width: 100%;
    height: auto;
    overflow: hidden;
}
</style>
