<template>
  <div class="envelope">
    <!-- Stream A: never paint invented gift name/amount while loading or on failure. -->
    <p class="ix-dualbook ix-envelope-note" role="note">
      <strong>Gifts are not ledger balances.</strong>
      Name, amount, and claim counts only appear after the gift API answers — loading and failures never invent a full gift book.
    </p>
    <p v-if="loadError" class="ix-empty ix-empty-error" role="alert" tabindex="-1" style="padding-top:120px;text-align:center;">{{ loadError }}</p>
    <p v-else-if="!envelopeReady" class="ix-empty ix-empty-loading" style="padding-top:80px;text-align:center;">{{ $t("common.loading") }}</p>
    <template v-else-if="envelopeReady">
    <div v-if="hasInviteUser" style="width:80%;height: 35px;padding: 5px 0 5px 0px;border-radius: 35px;background-color:rgb(157, 0, 0);margin-left:10%;text-align:center;display: flex;flex-direction:row;justify-content:center;margin-bottom:10px;">
      <img style="width: 25px; height: 25px;margin-right: 10px;border-radius: 25px;" :src="inviteUserAvatar"></img>
      <div style="height: 30px;line-height:30px;color: #EEE;">{{inviteUserId}} has sent you a gift!</div>
    </div>
    <div style="position:absolute;top: 40px;width: 100%;text-align:center;padding-top: 50px;">
      <div v-if="hasInviteUser" style="width:100%;height:35px;"></div>
      <p style="text-align:center;padding: 15px 0px;font-size:14px;letter-spacing:1px;width:100%;color:#000;">{{envelopeInfo.name}}</p>
      <p style="text-align:center;padding: 15px 0px;font-size:36px;letter-spacing:1px;width:100%;color:#fb272a;font-weight:bold;">{{envelopeInfo.totalAmount}} {{envelopeInfo.unit}}</p>
      <p style="text-align:center;padding: 15px 0px;font-size:14px;letter-spacing:1px;width:100%;color:rgb(227, 205, 187);">Claimed:{{envelopeInfo.receiveCount}}/{{envelopeInfo.count}}</p>
      <p style="text-align:center;padding: 20px 0px;font-size:14px;letter-spacing:1px;width:100%;color:#555;margin-top: 40px;">
        <img style="width: 100%;height:60px;width:60px;border-radius:60px;" :src="envelopeInfo.logo"></img>
      </p>
    </div>
    <img style="width: 100%;" :src="envelopeInfo.bgImage"></img>
    <p style="margin-top: -80px;margin-bottom: 80px;text-align:center;color: rgb(255, 136, 79);font-size:13px;">Sent via INTAFACED</p>
    <div class="input-panel" v-if="!hasReceived && envelopeInfo.state == 0">
      <div style="color: rgb(177, 177, 177);font-size: 16px;margin: 10px 0 20px 0;" v-html="envelopeInfo.detail"></div>
      <Form ref="formInline" inline>
        <FormItem prop="user">
          <Input type="text" v-model="formInline.phone" placeholder="Enter your phone number"></Input>
        </FormItem>

        <FormItem prop="code">
          <Input type="text" v-model="formInline.verifyCode" :placeholder="$t('uc.regist.smscode')">
          </Input>
          <input id="sendCode" @click="sendCode();" type="Button" shape="circle" :value="sendcodeValue" :disabled='codedisabled'>
          </input>
        </FormItem>
        <FormItem>
          <Button class="register_btn" @click="handleSubmit()">Claim</Button>
        </FormItem>
      </Form>
    </div>

    <div class="envelope-result" v-if="hasReceived && envelopeInfo.state == 0">
      <p style="font-size:14px;text-align:center;color: #999;margin-top: 5px;">Congratulations!</p>
      <p style="text-align:center;font-size: 30px;color: rgb(251, 39, 42);font-weight:bold;margin: 10px 0;">{{receiveAmount}} {{envelopeInfo.unit}}</p>
      <Button v-if="envelopeInfo.invite == 1" class="register_btn" @click="inviteMore()">Invite friends for more claims</Button>
      <p v-if="envelopeInfo.invite ==1" style="font-size:14px;text-align:center;color: #999;margin-top:15px;">Each friend you invite adds one claim</p>
      <p style="text-align:center;">
        <router-link style="font-size:14px;text-align:center;color: #3f3f3f;margin-top:15px;text-decoration:underline;" to="/app">Download the app | View balance</router-link>
      </p>
    </div>
    <div class="envelope-result" v-if="envelopeInfo.state == 1">
      <p style="font-size:20px;text-align:center;color: #999;margin-top: 5px;">All claimed.</p>
    </div>
    <div class="envelope-result" v-if="envelopeInfo.state == 2">
      <p style="font-size:20px;text-align:center;color: #999;margin-top: 5px;">This gift has expired.</p>
    </div>

    <div class="record-list">
      <div class="title">Claim history</div>

      <div class="content">
        <p v-if="detailError" class="ix-empty ix-empty-error" role="alert" tabindex="-1">{{ detailError }}</p>
        <p v-else-if="!detailLoaded" class="ix-empty ix-empty-loading">{{ $t("common.loading") }}</p>
        <p v-else-if="envelopeDetailList.length == 0" class="ix-empty" style="margin: 20px 0;">No claims yet</p>
        <div class="item clearfix" v-for="(item, idx) in envelopeDetailList" :key="idx">
          <div class="phone">{{item.userIdentify}}</div><div class="amount">{{item.amount}} {{envelopeInfo.unit}}</div>
        </div>
      </div>
    </div>
    </template>
    <p style="text-align:center;margin-top: 25px;margin-bottom: 20px;">
    <router-link style="font-size:14px;text-align:center;color: #EEE;margin-top:15px;text-decoration:underline;" to="/app">© INTAFACED.COM | Download the app</router-link>
    </p>

    <Spin size="large" fix v-if="spinShow"></Spin>
  </div>
</template>

<script>
export default {
  data() {
    return {
      spinShow: false,
      hasReceived: false,
      inviteLink: "",
      envelopeNo: "",
      country: "",
      sendcodeValue: this.$t("uc.regist.sendcode"),
      codedisabled: false,
      receiveAmount: "",
      promotionCode: "",
      hasInviteUser: false,
      inviteUserId: "",
      inviteUserAvatar: "/static/defaultavatar.png",
      /* Never invent gift name/amount/counts before query answers. */
      loadError: "",
      envelopeReady: false,
      detailLoaded: false,
      detailError: "",
      envelopeInfo: {
        id: 0,
        name: "",
        totalAmount: "",
        unit: "",
        receiveCount: "",
        count: "",
        invite: 0,
        type: 0,
        logo: "/static/applogo.svg",
        bgImage: "/static/redenvelope.png",
        state: -1,
        detail: ""
      },
      formInline: {
        verifyCode: "",
        phone: "",
        promotionCode: "",
        envelopeNo: ""
      },
      queryDetail: {
        envelopeId: "",
        pageNo: 0,
        pageSize: 30
      },
      envelopeDetailList: [],
      countdown: 60,
    };
  },
  created: function() {
    this.init();
  },
  computed: {
    lang() {
      return this.$store.state.lang;
    },
    langPram() {
      // English only — the backend must never be asked for CN content.
      return "EN";
    }
  },
  methods: {
    init() {
      this.$store.state.HeaderActiveName = "1-8";
      this.$store.commit("navigate", "nav-envelope");

      var eNo = this.$route.params.eno;

      if (eNo == undefined) {
        this.$router.push("/app");
      }else{
        this.formInline.envelopeNo = eNo;
        if(this.$route.query.code!= undefined && this.$route.query.code!= "" && this.$route.query.code!= null){
            this.formInline.promotionCode = this.$route.query.code;
        }
      }

      this.getEnvelope();
    },
    sendCode(){
      var reg = /^[1][3,4,5,6,7,8,9][0-9]{9}$/;
      if(!reg.test(this.formInline.phone)) {
        this.$Message.error("Enter a valid phone number");
      }else{
        var params = {};
        params["phone"] = this.formInline.phone;
        params["country"] = "China";
        params["envelopeId"] = this.envelopeInfo.id;
        if(this.envelopeInfo.id == 0 || this.envelopeInfo.id == null || this.envelopeInfo.id == undefined){
          this.$Message.error("Gift not found");
          return;
        }
        this.$http.post(this.host + "/uc/redenvelope/code", params).then(response => {
          var resp = response.body;
          resp.code == 0 && this.$Message.success(resp.message);
          resp.code == 0 && this.settime();
          resp.code!= 0 && this.$Message.error(resp.message);
        }).catch(() => {
          this.$Message.error(this.$t("cms.envelopeUnavailable"));
        });
      }
    },
    settime() {
      this.sendcodeValue = this.$t("uc.regist.resendcode") + this.countdown + ")";
      this.codedisabled = true;
      var _this = this;
      let timercode = setInterval(() => {
        _this.countdown--;
        _this.sendcodeValue = _this.$t("uc.regist.resendcode") + _this.countdown + ")";
        if (this.countdown <= 0) {
          clearInterval(timercode);
          _this.codedisabled = false;
          _this.sendcodeValue = _this.$t("uc.regist.sendcode");
          _this.countdown = 60;
        }
      }, 1000);
    },
    handleSubmit(){
      if (this.formInline.verifyCode == "") {
        this.$Message.error("Enter the verification code");
        return;
      }

      this.$http.post(this.host + "/uc/redenvelope/receive", this.formInline).then(res => {
        if (res.status == 200 && res.body && res.body.code == 0 && res.body.data) {
          this.promotionCode = res.body.data.promotionCode;
          this.receiveAmount = res.body.data.amount;
          this.hasReceived = true;
          this.getEnvelopeDetailList();
        } else {
            this.$Message.error((res.body && res.body.message) || this.$t("cms.envelopeUnavailable"));
        }
      }).catch(() => {
        this.$Message.error(this.$t("cms.envelopeUnavailable"));
      });
    },
    inviteMore(){
      this.$router.replace('/envelope/' + this.formInline.envelopeNo + "?code=" + this.promotionCode);
      this.$Modal.confirm({
          title: 'redirect refresh notice',
          content: '<p>Click"Confirm"to generate your personal invite page.</p><br><p>How it works: open your invite page, then share it with your contacts.</p>',
          onOk: () => {
              this.formInline.promotionCode = this.promotionCode;
              this.hasReceived = false;
              this.getEnvelope();
          },
          onCancel: () => {

          }
      });
    },
    getEnvelope(){
        let param = {};
        param["envelopeNo"] = this.formInline.envelopeNo;
        param["code"] = this.formInline.promotionCode;

        this.spinShow = true;
        this.loadError = "";
        this.envelopeReady = false;
        this.$http.post(this.host + "/uc/redenvelope/query", param).then(res => {
          this.spinShow = false;
          if (res.status == 200 && res.body && res.body.code == 0 && res.body.data) {
            this.envelopeInfo.id = res.body.data.id;
            this.envelopeInfo.name = res.body.data.name;
            this.envelopeInfo.totalAmount = res.body.data.totalAmount;
            this.envelopeInfo.receiveCount = res.body.data.receiveCount;
            this.envelopeInfo.count = res.body.data.count;
            this.envelopeInfo.detail = res.body.data.detail;
            this.envelopeInfo.unit = res.body.data.unit;
            this.envelopeInfo.invite = res.body.data.invite;
            this.envelopeInfo.type = res.body.data.type;
            this.envelopeInfo.state = res.body.data.state;
            if(res.body.data.inviteUser!= null && res.body.data.inviteUser!= "" && res.body.data.inviteUser!= undefined) {
              this.hasInviteUser = true;
              this.inviteUserId = res.body.data.inviteUser;
              if(res.body.data.inviteUserAvatar!= null){
                this.inviteUserAvatar = res.body.data.inviteUserAvatar;
              }
            }

            if(res.body.data.logoImage!= null && res.body.data.logoImage!= "") {
              this.envelopeInfo.logo = res.body.data.logoImage;
            }
            if(res.body.data.bgImage!= null && res.body.data.bgImage!= "") {
              this.envelopeInfo.bgImage = res.body.data.bgImage;
            }

            this.envelopeReady = true;
            this.loadError = "";
            window.document.title = "[" + this.envelopeInfo.totalAmount + " " + this.envelopeInfo.unit + "]" + this.envelopeInfo.name + " — INTAFACED(INTAFACED.COM)Exchange"
            this.getEnvelopeDetailList();
          } else {
              this.envelopeReady = false;
              this.loadError =
                (res.body && res.body.message) ||
                this.$t("cms.envelopeUnavailable");
              if (res.body && res.body.message) this.$Message.error(res.body.message);
          }
        }).catch(() => {
          this.spinShow = false;
          this.envelopeReady = false;
          this.loadError = this.$t("cms.envelopeUnavailable");
        });
    },
    getEnvelopeDetailList(){
      this.queryDetail.envelopeId = this.envelopeInfo.id;
      this.detailLoaded = false;
      this.detailError = "";
      this.$http.post(this.host + "/uc/redenvelope/query-detail", this.queryDetail).then(res => {
        if (res.status == 200 && res.body && res.body.code == 0 && res.body.data) {
          this.envelopeDetailList = res.body.data.content || [];
          this.detailLoaded = true;
          this.detailError = "";
        } else {
            this.envelopeDetailList = [];
            this.detailLoaded = true;
            this.detailError =
              (res.body && res.body.message) ||
              this.$t("cms.envelopeDetailUnavailable");
            if (res.body && res.body.message) this.$Message.error(res.body.message);
        }
      }).catch(() => {
        this.envelopeDetailList = [];
        this.detailLoaded = true;
        this.detailError = this.$t("cms.envelopeDetailUnavailable");
      });
    }
  }
};
</script>

<style lang="scss">
.envelope {
  padding-top: 60px;
.envelope-result{
    width:90%;
    margin-left:5%;
    background:#FFF;
    border-radius: 5px;
    position:relative;
    padding: 15px 20px 25px 20px;
.register_btn.ivu-btn {
      width: 100%;
      background-color: #1ad4bc;
      outline: none;
      border-color: #1ad4bc;
      color: #fff;
      border-radius: 5px;
      font-size: 16px;
      margin-top: 10px;
      &:focus {
        -moz-box-shadow: 2px 2px 5px transparent, -2px -2px 4px transparent;
        -webkit-box-shadow: 2px 2px 5px transparent, -2px -2px 4px transparent;
        box-shadow: 2px 2px 5px transparent, -2px -2px 4px transparent;
      }
    }
  }
.input-panel{
    width:90%;
    margin-left:5%;
    background:#FFF;
    border-radius: 5px;
    position:relative;
    padding: 15px 20px 5px 20px;
    form.ivu-form.ivu-form-label-right.ivu-form-inline {
.ivu-form-item {
        margin-bottom: 15px;
.ivu-form-item-content {
.register_btn.ivu-btn {
            width: 100%;
            background-color: #1ad4bc;
            outline: none;
            border-color: #1ad4bc;
            color: #fff;
            border-radius: 5px;
            font-size: 16px;
            margin-top: 10px;
            &:focus {
              -moz-box-shadow: 2px 2px 5px transparent, -2px -2px 4px transparent;
              -webkit-box-shadow: 2px 2px 5px transparent, -2px -2px 4px transparent;
              box-shadow: 2px 2px 5px transparent, -2px -2px 4px transparent;
            }
          }
.ivu-input-wrapper.ivu-input-type {
.ivu-input {
              border: 1px solid red;
            }
          }
.ivu-input-wrapper{
.ivu-input-group-prepend{
              background-color:#FFF!important;
              border: none!important;
.ivu-select-visible{
.ivu-select-selection{
                  border-color: 1px solid #EDEDED!important;
                }
              }
.ivu-select{
                border: none!important;
.ivu-select-selection{
                  background: #EDEDED;
                  border-color: 1px solid #EDEDED!important;
                }
.ivu-select-selection-focused{
                  border-color: 1px solid #EDEDED!important;
                }
              }
            }
.ivu-input{
              background-color: #EDEDED!important;
              border: none!important;
              color: #333;
            }
.ivu-input:hover,.ivu-input-number-input:hover,.ivu-input-number:hover{
              border: none;
            }
          }
          #sendCode {
            position: absolute;
            border: none;
            background: transparent;
            top: 1px;
            outline: none;
            right: 0;
            width: 40%;
            color: #f05e19;
            cursor: pointer;
          }
        }
      }
.check-agree {
        color: #979797;
        display: inline-block;
        line-height: 30px;
        font-size: 12px;
        cursor: default;
        a {
          color: #1ad4bc;
          margin-left: -10px;
        }
.ivu-checkbox-wrapper.ivu-checkbox-wrapper-checked {
.ivu-checkbox.ivu-checkbox-checked {
.ivu-checkbox-inner {
              border: 1px solid #1ad4bc;
              background-color: #1ad4bc;
            }
          }
        }
      }
    }
  }

.record-list{
    margin-top:30px;
    text-align:center;
.title{
      position: relative;
      width: 40%;
      margin-left: 30%;
      font-size: 16px;
    }
.title:before{
      position: absolute;
      left: -30%;
      top: 12px;
      content: "";
      height: 1px;
      width: 50%;
      display: block;
      background-color:#FFF;
    }
.title:after{
      position: absolute;
      right: -30%;
      top: 12px;
      content: "";
      height: 1px;
      width: 50%;
      display: block;
      background-color:#FFF;
    }

.content{
      background-color:#FFF;
      width: 90%;
      border-radius: 5px;
      margin-left: 5%;
      margin-top: 20px;
      padding: 10px 5px;
.item{
        color: #888;
        padding: 8px 10px;
.phone{
          float:left;
          letter-spacing: 1px;
        }
.amount{
          float:right;
        }
      }
    }
  }
}

.clearfix:after {
  visibility: hidden;
  display: block;
  font-size: 0;
  content: " ";
  clear: both;
  height: 0;
}

.ix-dualbook.ix-envelope-note {
  margin: 12px 16px 0;
  padding: 10px 12px;
  border: 1px solid rgba(0, 194, 168, 0.35);
  border-radius: 6px;
  background: rgba(0, 194, 168, 0.06);
  color: #c8cdd4;
  font-size: 12.5px;
  line-height: 1.5;
  text-align: left;
}
.ix-dualbook.ix-envelope-note strong {
  color: #00c2a8;
  font-weight: 600;
}
</style>
