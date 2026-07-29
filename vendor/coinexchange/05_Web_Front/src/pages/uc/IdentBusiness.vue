<template>
  <div class="identbusiness" style=" padding: 81px;padding-top: 80px;">
    <div class="content">
      <!---->
      <!--<div class="tit">{{$t('uc.identity.apply')}}</div>-->
      <!--<div class="plancon">-->
      <!--<span></span>-->

      <!--<div class="plan">-->
      <!--<div v-for="(step,i) in steps" :key="step" :class="{action:activeStepIndex>=i}">-->
      <!--{{activeStepIndex>=i?'':i+1}}-->
      <!--</div>-->
      <!--</div>-->

      <!--<div class="plans">-->
      <!--<div v-for="step in steps" :key="step">-->
      <!--{{step}}-->
      <!--</div>-->
      <!--</div>-->
      <!--</div>-->
      <div style="width: 80%;margin: 0 auto;margin-bottom: 60px;">
        <div class="ident-title" v-if="certStatus === 0">
          <!-- merchant verification application -->
          <h3>{{$t('uc.identity.apply')}}</h3>
          <p style="font-size: 14px;margin-top: 10px">
            <!-- {{$t('uc.identity.become')}} -->
          </p>
        </div>
        <div class="ident-title" v-else-if="certStatus == 1">
          <h3>{{$t('uc.identity.tijiao')}}</h3>
        </div>
        <div class="ident-title" v-else-if="certStatus == 2">
          <h3>{{$t('uc.identity.tijiaosuc')}}</h3>
        </div>
        <div class="ident-title" v-else-if="certStatus == 3">
          <h3>{{$t("uc.identity.tijiaofail")}}</h3>
        </div>
        <div class="ident-title" v-else-if="certStatus == 5">
          <h3>{{$t("uc.identity.zhuxiaotijiao")}}</h3>
        </div>
        <div class="ident-title" v-else-if="certStatus == 6">
          <h3>{{$t("uc.identity.shenhefail")}}</h3>
        </div>
        <div class="ident-title" v-else-if="certStatus == 7">
          <h3>{{$t("uc.identity.shenhesuc")}}</h3>
        </div>
        <!-- prepare:prepare: documents; review: submitted; result: outcome; certified: verified; shenheshibai: Review failed-->
        <Steps class="apply-step" :current="certStatus == 2? 3: certStatus == 3? 2: certStatus" :status="certStatus == 3? 'error':'finish'" v-if="certStatus!= 0 && certStatus!= 5 && certStatus!= 6 && certStatus!= 7">
          <Step :title=prepare></Step>
          <Step :title=review></Step>
          <Step :title="certStatus == 1 || certStatus == 0? result: certStatus == 2? certified: shenheshibai"></Step>
        </Steps>
        <!-- shangjiazhuxiao: deregistered; tijiaoshenqing: submitted; shenheshibai: failed; passed: approved-->
        <Steps class="apply-step" :current="certStatus == 5? 1: certStatus == 6? 2: 3" :status="certStatus == 6? 'error':'finish'" v-if="certStatus == 5 || certStatus == 6 || certStatus == 7">
          <Step :title=shangjiazhuxiao></Step>
          <Step :title=tijiaoshenqing></Step>
          <Step :title="certStatus == 5? result: certStatus == 6? shenheshibai: passed"></Step>
        </Steps>

        <div v-if="certStatus == 6" style="width: 500px;margin: 0 auto;text-align: center;">
          <Button type="warning" style="width: 120px;background:#ff8534;border-color:#ff8534" @click="modal_return=true" long size="large">{{$t("uc.identity.shenagain")}}</Button>
          <div class="fail-reason" style="margin-top: 50px;font-size: 16px;">
            <Icon type="md-alert" color="red" size="16" />
            <span style="margin-left: 10px;">{{$t('uc.identity.yuanyin')}}: {{refuseReason}}</span>
          </div>
        </div>

        <div v-if="certStatus == 7" style="width: 500px;margin: 0 auto;text-align: center;">
          <Button type="warning" style="width: 120px;background:#ff8534;border-color:#ff8534" @click="modal_read=true" long size="large">{{$t("uc.identity.sheqinggain")}}</Button>
        </div>

        <div v-if="certStatus == 3" style="width: 500px;margin: 0 auto;text-align: center;">
          <Button type="warning" style="width: 120px;background:#ff8534;border-color:#ff8534" @click="modal_read=true" long size="large">{{$t("uc.identity.shenagain")}}</Button>
          <div class="fail-reason" style="margin-top: 50px;font-size: 16px;">
            <Icon type="md-alert" color="red" size="16" />
            <span style="margin-left: 10px;">{{$t("uc.identity.reason")}}: {{certReason}}</span>
          </div>
        </div>

        <div v-else-if="certStatus == 2" style="width: 500px;margin: 0 auto;text-align: center;">
          <Button type="warning" style="width: 120px;background:#ff8534;border-color:#ff8534" @click="publishAd" long size="large">{{$t('nav.fabu')}}</Button>
          <div style="margin-top: 30px;font-size: 16px;text-align: center;">
            <a @click="returnAdit" style="color: #aaa;">{{$t("uc.identity.shenqingtuibao")}}</a>
          </div>
        </div>
      </div>
      <!-- merchant verification, step one -->
      <div class="ipshang" :class="certStatus!= 0? 'applying': '' ">
        <div class="ident-title" v-if="certStatus == 3">
          <h3 style="font-size: 20px">{{$t('uc.identity.apply')}}</h3>
          <p style="font-size: 14px;margin-top: 10px"> {{$t('uc.identity.become')}}</p>
        </div>
        <div class="ident-title" v-else-if="certStatus == 2">
          <h3>{{$t("uc.identity.getquan")}}</h3>
        </div>
        <!-- step one -->
        <Row style="margin-top:40px;">
          <Col span="8">
          <div class="business-function">
            <img alt="" src="../../assets/images/business_show.png" width="300px">
            <p style="padding: 20px 0;font-weight: 600;font-size: 18px">{{$t('uc.identity.seat')}}</p>
            <span style="font-size: 14px;overflow:hidden; overflow: hidden;text-overflow:ellipsis;display: block;white-space:nowrap;color:#999;">{{$t("uc.identity.zhusnhu")}}</span>
          </div>
          </Col>
          <Col span="8">
          <div class="business-function">
            <img alt="" src="../../assets/images/business_service.png" width="300px">
            <p style="padding: 20px 0;font-weight: 600;font-size: 18px">{{$t('uc.identity.service')}}</p>
            <span style="font-size: 14px;color:#999;">{{$t("uc.identity.service")}}</span>
          </div>
          </Col>
          <Col span="8">
          <div class="business-function">
            <img alt="" src="../../assets/images/business_fee.png" width="300px">
            <p style="padding: 20px 0;font-weight: 600;font-size: 18px">{{$t('uc.identity.lowfee')}}</p>
            <span style="font-size: 14px;color:#999;">{{$t("uc.identity.lowfee")}}</span>
          </div>
          </Col>
        </Row>
        <!-- step-one agreement -->
        <div v-show="certStatus === 0" style="text-align: center;font-size: 16px;margin-top:50px">
          <Checkbox v-model="single"></Checkbox>
          <span>{{$t("uc.identity.read")}}</span>
          <router-link target="_blank" to="/helpdetail?cate=1&id=11&cateTitle=FAQ" class="cur" style="color:#ff6b00">{{$t('uc.identity.agreement')}}</router-link>
        </div>
        <!-- step-one button -->
        <div v-show="certStatus === 0" class="sq">
          <Button @click="apply" style="background:#ff6b00;color:#fff;outline:none;">{{$t("uc.identity.lijishenqing")}}</Button>
        </div>
      </div>

      <!-- merchant end -->
      <!-- send email -->
      <div class="mail" v-show="isShowMailt">
        <Input v-model="value" :placeholder="$t('uc.identity.mailplaceholder')" style="width: 300px"></Input><br/>
        <Input v-model="value" :placeholder="$t('uc.identity.mailplaceholder')" style="width:202px"></Input>
        <Button type="info">{{$t('uc.identity.sendcode')}}</Button><br/>
        <Button type="info" style="margin-top: 25px; width: 297px;">{{$t('uc.identity.confirm')}}</Button>
      </div>
      <!-- email end -->
    </div>
    <!-- under review -->
    <div class="submittedAudit" v-show="activeStepIndex === 1">
      <img src="../../assets/img/accomplish.png" alt="">
    </div>
    <!-- end -->
    <!-- approved -->
    <div class="auditSuccess" v-show="activeStepIndex === 2">
      <img src="../../assets/img/accomplish.png" alt="">
    </div>

    <Modal v-model="modal_read">
      <!-- how to become a merchant -->
      <p slot="header">
        <span class="tit">{{$t('uc.identity.second.line')}}</span>
      </p>
      <div class="apply-note">
        <h3 style="padding-top: 10px;">{{$t('uc.identity.second.step1')}}</h3>
        <p>{{$t('uc.identity.second.step1c1')}}<br>{{$t('uc.identity.second.step1c2')}}</p>
        <h3>{{$t('uc.identity.second.step2')}}</h3>
        <p>{{$t('uc.identity.second.step2c')}}</p>
        <h3>{{$t('uc.identity.second.step3')}}</h3>
        <p>{{$t('uc.identity.second.stepc')}}</p>
        <div style="text-align: left;padding: 30px 0;">
          <Checkbox v-model="agreeFrozen"></Checkbox> {{$t('uc.identity.second.agree')}}
          <span>
            <font color="#ff6b00">{{auditText}}</font>{{$t('uc.identity.second.agreec')}}</span>
        </div>
        <Button @click="apply2" long style="font-size: 16px;background:#ff6b00;color:#fff;border:1px solid #ff6b00;">{{$t('uc.identity.second.shenqingchngweishangjia')}}</Button>
      </div>
      <p slot="footer">
        <!--<span style="text-align: left">-->
        <!--<Checkbox v-model="agreeFrozen" ></Checkbox> <span>I agree to lock{{auditText}}as a merchant bond</span>-->
        <!--</span>-->
        <!--<Button type="info" @click="apply2">Apply to become a merchant</Button>-->
      </p>
    </Modal>

    <Modal v-model="modal_apply">
      <p slot="header"></p>
      <div class="apply-content">
        <div class="apply-title">
          <h3>{{$t("uc.identity.tijiaoziliao")}}</h3>
          <p>{{$t("uc.identity.place")}}</p>
        </div>
        <Form class="apply-form" :model="apply_form" label-position="top">
          <FormItem :label="phone">
            <Input type="text" v-model="apply_form.telno" :placeholder="noEmpty"></Input>
          </FormItem>
          <FormItem :label="wechat">
            <Input type="text" v-model="apply_form.wechat" :placeholder="noEmpty"></Input>
          </FormItem>
          <FormItem :label="qq">
            <Input type="text" v-model="apply_form.qq" :placeholder="noEmpty"></Input>
          </FormItem>
          <Row>
            <Col span="8">
            <FormItem :label="bizhong">
              <Select v-model="apply_form.coinSymbol" :placeholder="select" @on-change="onCoinChange">
                <Option v-for="(item,index) in auditCurrency" :value="item.coin.unit" :key="index"></Option>
              </Select>
            </FormItem>
            </Col>
            <Col span="8">
            <span>&nbsp;</span>
            </Col>
            <Col span="8">
            <FormItem :label="shuliang">
              <Label v-model="apply_form.amount">{{apply_form.amount}}</Label>
            </FormItem>
            </Col>
          </Row>
          <Row>
            <Col span="8">
            <Upload type="drag" ref="upload1" :on-success="assetHandleSuccess" :headers="uploadHeaders" :action="uploadUrl" :on-remove="assetRemove">
              <span style="line-height: 100px;font-size: 50px;color:#ccc;">+</span>
              <img v-show="assetImg" class="previewImg" :src="assetImg">
            </Upload>
            <span>{{$t("uc.identity.gerenzichan")}}</span>
            </Col>
            <Col span="8">
            <span>&nbsp;</span>
            </Col>
            <Col span="8">
            <Upload type="drag" ref="upload2" :on-success="tradeHandleSuccess" :headers="uploadHeaders" :action="uploadUrl" :on-remove="tradeRemove">
              <span style="line-height: 100px;font-size: 50px;color:#ccc;">+</span>
              <img v-show="tradeImg" class="previewImg" :src="tradeImg">
            </Upload>
            <span>{{$t("uc.identity.shuzizichan")}}</span>
            </Col>
          </Row>
          <FormItem style="margin-top: 20px;">
            <Button style="width:100%;background:#ff6b00;color:#fff;border:1px solid #ff6b00;" type="info" @click="apply3('apply_form')" :disabled="applyBtn">{{$t("uc.identity.lijishenqing")}}</Button>
          </FormItem>
        </Form>
      </div>
      <p slot="footer"></p>
    </Modal>

    <Modal v-model="modal_return" @on-ok="returnAudit">
      <p slot="header" style="text-align: center;">{{$t("uc.identity.tips")}}</p>
      <p style="text-align: center;font-size: 14px;">{{$t("uc.identity.wufachexiao")}}</p>
      <p style="text-align: center;font-size: 14px;">{{$t("uc.identity.suredo")}}</p>
      <Input v-model="returnReason" type="textarea" :placeholder=placeholder:rows="4"></Input>
    </Modal>
  </div>

</template>
<script>
export default {
  data() {
    return {
      noEmpty: "Required",
      review: this.$t("uc.identity.review"), //Prepare documents
      prepare: this.$t("uc.identity.prepare"), //Submit for review;
      result: this.$t("uc.identity.result"), //Await outcome;
      certified: this.$t("uc.identity.certified"), //Verified
      shenheshibai: this.$t("uc.identity.shenheshibai"), //Review failed
      shangjiazhuxiao: this.$t("uc.identity.shangjiazhuxiao"), //Merchant deregistered
      tijiaoshenqing: this.$t("uc.identity.tijiaoshenqing"), //Submit application
      shenheshibai: this.$t("uc.identity.shenheshibai"), //Review failed
      passed: this.$t("uc.identity.passed"), //Approved
      placeholder: this.$t("uc.identity.placeholder"),
      select: this.$t("uc.identity.chosen"),
      phone: this.$t("uc.identity.phone"),
      qq: this.$t("uc.identity.qq"),
      wechat: this.$t("uc.identity.wx"),
      bizhong: this.$t("uc.identity.bizhong"),
      shuliang: this.$t("uc.identity.shuliang"),
      loginmsg: this.$t("common.logintip"),
      single: false,
      value: "",
      isShowShang: true,
      isShowMailt: false,
      isShowSubmitted: false,
      isShowSuccess: false,
      activeStepIndex: 0,
      steps: [
        this.$t("uc.identity.prepare"),
        this.$t("uc.identity.review"),
        this.$t("uc.identity.passed")
      ],
      certStatus: 0, //verification status — 0: not applied, 1: under review, 2: verified, 3: failed
      certReason: "",
      auditCurrency: "",
      auditText: "",
      modal_read: false,
      modal_return: false,
      agreeFrozen: false,
      modal_apply: false,
      applyBtn: false,
      apply_form: {
        telno: "",
        wechat: "",
        qq: "",
        coinSymbol: "",
        amount: "",
        assetData: "",
        tradeData: ""
      },
      assetImg: "",
      tradeImg: "",
      uploadHeaders: { "x-auth-token": localStorage.getItem("TOKEN") },
      uploadUrl: this.host + "/uc/upload/oss/image",
      returnReason: "",
      refuseReason: ""
    };
  },
  methods: {
    islogin() {
      let self = this;
      // ;
      this.$http
.post(this.host + "/uc/approve/security/setting", {})
.then(response => {
          var resp = response.body;
          if (resp.code == 0) {
            if (resp.data.realName == null || resp.data.realName == "") {
              this.$Message.warning(this.$t("otc.publishad.submittip1"));
              self.$router.push("/uc/safe");
            } else if (resp.data.phoneVerified == 0) {
              this.$Message.warning(this.$t("otc.publishad.submittip2"));
              self.$router.push("/uc/safe");
            } else if (resp.data.fundsVerified == 0) {
              this.$Message.warning(this.$t("otc.publishad.submittip3"));
              self.$router.push("/uc/safe");
            }
          } else {
            this.$Message.error(resp.message);
          }
        });
    },
    timer() {
      setInterval(() => {
        this.getSetting();
      }, 10000);
    },
    publishAd() {
      this.$router.push("/uc/ad/create");
    },
    returnAdit() {
      this.modal_return = true;
    },
    returnAudit() {
      var params = {};
      params["detail"] = this.returnReason;
      this.$http
.post(this.host + "/uc/approve/cancel/business", params)
.then(res => {
          let resp = res.body;
          if (resp.code == 0) {
            this.$Message.success(this.$t("uc.identity.submitted"));
            this.modal_return = false;
            this.getSetting();
          } else {
            this.$Message.error(resp.message);
          }
        });
    },
    getAudiCoin(symbol) {
      var coin = null;
      for (var i = 0; i < this.auditCurrency.length; i++) {
        if (symbol == this.auditCurrency[i].coin.unit) {
          coin = this.auditCurrency[i];
          break;
        }
      }
      return coin;
    },
    onCoinChange(value) {
      var coin = this.getAudiCoin(value);
      if (coin!= null) {
        this.apply_form.amount = coin.amount;
      }
    },
    getSetting() {
      this.$http
.get(this.host + this.api.uc.identification)
.then(res => {
          let certifiedBusinessStatus = res.body.data.certifiedBusinessStatus;
          this.activeStepIndex = certifiedBusinessStatus;
          this.certStatus = certifiedBusinessStatus;
          this.certReason = res.body.data.detail;
          this.refuseReason = res.body.data.reason;
        })
.catch(function(error) {});
    },
    assetHandleSuccess(res, file, fileList) {
      // fileList = fileList[fileList.length-1]
      this.$refs.upload1.fileList = [fileList[fileList.length - 1]];
      this.apply_form.assetData = res.data;
      this.assetImg = res.data;
    },
    tradeHandleSuccess(res, file, fileList) {
      this.$refs.upload2.fileList = [fileList[fileList.length - 1]];
      this.apply_form.tradeData = res.data;
      this.tradeImg = res.data;
    },
    assetRemove(file, fileList) {
      this.apply_form.assetData = "";
      this.assetImg = "";
    },
    tradeRemove(file, fileList) {
      this.apply_form.tradeData = "";
      this.tradeImg = "";
    },
    getAuthFound() {
      this.$http
.get(this.host + "/uc/approve/business-auth-deposit/list")
.then(res => {
          var resp = res.body;
          if (resp.code == 0) {
            this.auditCurrency = resp.data;
            var tempText = "";
            for (var i = 0; i < resp.data.length; i++) {
              if (i == 0) {
                //BHB;
                this.apply_form.coinSymbol = resp.data[i].coin.unit;
                //10000;
                this.apply_form.amount = resp.data[i].amount;
              }
              tempText += resp.data[i].amount + "" + resp.data[i].coin.unit;
              if (i < resp.data.length - 1) tempText += "or";
            }
            this.auditText = tempText;
          }
        });
    },
    apply() {
      let stasingle = this.single;
      if (stasingle == false) {
        this.$Message.warning(this.$t("uc.identity.approve"));
        return;
      }
      this.modal_read = true;
      return;
      this.$http
.get(this.host + this.api.uc.apply)
.then(res => {
          debugger;
          var resp = res.body;
          if (resp.code == 0) {
            this.$Message.success(resp.message);
            this.activeStepIndex = 1;
          } else {
            this.$Message.warning(resp.message);
          }
        })
.catch(function(error) {
          this.$Message.error(error);
        });
    },
    apply2() {
      let agreeFrozen = this.agreeFrozen;
      if (agreeFrozen == false) {
        this.$Message.warning(this.$t("uc.identity.agreefreeze"));
        return;
      }
      this.modal_read = false;
      this.modal_apply = true;
    },
    apply3(form) {
      if (this.apply_form.telno == "") {
        this.$Message.error(this.$t("uc.identity.telrequired"));
        return;
      }
      if (this.apply_form.wechat == "") {
        this.$Message.error(this.$t("uc.identity.wechatrequired"));
        return;
      }
      if (this.apply_form.qq == "") {
        this.$Message.error(this.$t("uc.identity.qqrequired"));
        return;
      }
      if (this.apply_form.assetData == "") {
        this.$Message.error(this.$t("uc.identity.assetrequired"));
        return;
      }
      if (this.apply_form.tradeData == "") {
        this.$Message.error(this.$t("uc.identity.traderequired"));
        return;
      }
      var params = {};
      params["businessAuthDepositId"] = this.getAudiCoin(
        this.apply_form.coinSymbol
).id;
      params["json"] = JSON.stringify(this.apply_form);
      this.$http
.post(this.host + "/uc/approve/certified/business/apply", params)
.then(res => {
          var resp = res.body;
          if (resp.code == 0) {
            this.$Message.success(this.$t("uc.identity.submitted"));
            this.modal_apply = false;
            this.certStatus = 1;
          } else {
            this.$Message.error(resp.message);
          }
        });
    }
  },
  created() {
    //this.timer();
    this.islogin();
    this.getSetting();
    this.getAuthFound();
  },
  computed: {
    lang: function() {
      return this.$store.state.lang;
    }
  },
  watch: {
    lang: function() {
      this.prepare = this.$t("uc.identity.prepare");
      this.review = this.$t("uc.identity.review");
      this.result = this.$t("uc.identity.result");
      this.certified = this.$t("uc.identity.certified"); //Verified
      this.shenheshibai = this.$t("uc.identity.shenheshibai"); //Review failed
      this.shangjiazhuxiao = this.$t("uc.identity.shangjiazhuxiao"); //Merchant deregistered
      this.tijiaoshenqing = this.$t("uc.identity.tijiaoshenqing"); //Submit application
      this.shenheshibai = this.$t("uc.identity.shenheshibai"); //Review failed
      this.passed = this.$t("uc.identity.passed"); //Approved

      this.phone = this.$t("uc.identity.phone");
      this.qq = this.$t("uc.identity.qq");
      this.wechat = this.$t("uc.identity.wx");
      this.bizhong = this.$t("uc.identity.bizhong");
      this.shuliang = this.$t("uc.identity.shuliang");
    }
  }
};
</script>

<style scoped>
.previewImg {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
}
.content {
  width: 1200px;
  margin: 0 auto;
  padding-top: 30px;
  height: 100%;
  background: #000000;
}
.ip.ivu-col {
  line-height: 37px;
  text-align: left;
  padding-left: 139px;
}
.ipshang {
  overflow: hidden;
}
.ipshang.applying {
  background: #1c1c1c;
  padding: 40px 0;
}
.sq {
  width: 1200px;
  margin-top: 50px;
  text-align: center;
  margin-bottom: 50px;
}
.xian {
  width: 100%;
  height: 1px;
  margin-top: 105px;
  border-top: 1px #ececec dotted;
}
.sq button {
  height: 50px;
  font-size: 18px;
  width: 450px;
}
.tit {
  font-size: 16px;
  line-height: 25px;
  border-left: 5px solid #ff6b00;
  padding-left: 15px;
}
.plancon {
  width: 64%;
  margin: 49px auto;
  position: relative;
}
.plan {
  position: absolute;
  height: 36px;
  width: 100%;
  top: -13px;
}
.plans {
  position: absolute;
  height: 36px;
  width: 100%;
  top: 13px;
}
.plan div {
  z-index: 99;
  float: left;
  width: 33.33%;
  color: white;
  height: 31px;
  line-height: 31px;
  text-align: center;
  background: url("../../assets/img/2.png") center no-repeat;
  background-size: contain;
}
.action {
  z-index: 99999!important;
  float: left;
  width: 25%;
  height: 31px;
  line-height: 31px;
  text-align: center;
  background-size: contain;
  background: url("../../assets/img/1.png") center no-repeat!important;
}
.plans div {
  z-index: 99;
  float: left;
  width: 33.333%;
  height: 53px;
  line-height: 53px;
  font-size: 14px;
  text-align: center;
  background-size: contain;
}
.plancon span {
  background: #ececec;
  height: 1px;
  width: 65%;
  display: inherit;
  margin: 0 auto;
}
.ivu-col-span-8 p {
  font-size: 19px;
}
.peakfire {
  width: 1000px;
  margin: 0 auto;
  height: 80px;
  line-height: 80px;
  border: 1px solid #eaeaea;
  margin-top: 43px;
  padding-left: 25px;
}
.peakfire span {
  color: #3faef5;
}
.mail {
  width: 1000px;
  margin: 87px auto;
  text-align: center;
  line-height: 50px;
  display: none;
}
.submittedAudit {
  width: 1000px;
  margin: 87px auto;
  text-align: center;
  display: none;
}
.auditSuccess {
  width: 1000px;
  margin: 87px auto;
  text-align: center;
  display: none;
}
.apply-note {
  font-size: 14px;
}
.apply-note h3 {
  padding: 20px 0;
  font-size: 16px;
}
.apply-note ul {
  list-style: initial;
  padding-left: 20px;
}
.apply-content {
  width: 80%;
  margin: 0 auto;
}
.apply-title {
  text-align: center;
}
.apply-title h3 {
  font-size: 20px;
}
.apply-title p {
  font-size: 14px;
  padding: 10px 0;
}
.ident-title {
  text-align: center;
  font-size: 20px;
}
.apply-step {
  padding: 50px 0;
  margin-left: 150px;
}
.apply-step.ivu-steps-title {
  display: block;
}
.business-function {
  width: 300px;
  margin: 0 auto;
  border: none;
  background-color: #141414;
  padding-bottom: 20px;
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
}
</style>
<style>
.ivu-form-item {
  margin-bottom: 24px;
}
.ivu-steps-item.ivu-steps-status-finish.ivu-steps-head-inner {
  background-color: #282828;
  border-color: #282828;
}
.ivu-steps-item.ivu-steps-status-finish.ivu-steps-head-inner >.ivu-steps-icon,
.ivu-steps-item.ivu-steps-status-finish.ivu-steps-head-inner span {
  color: #fff!important;
}
.ivu-steps-item.ivu-steps-status-process.ivu-steps-head-inner {
  border-color: #282828;
  background-color: #282828;
}
.ivu-steps-item.ivu-steps-status-finish.ivu-steps-tail > i:after {
  background: #282828;
}
.identbusiness.ivu-steps.ivu-steps-head{
  background-color:#000000;
}
.identbusiness.ivu-steps.ivu-steps-title{
  background-color:#000000;
  color:#fff;
}
</style>
<style lang="scss">
.v-transfer-dom {
.ivu-modal-wrap {
.ivu-modal-content {
.apply-content {
        form.apply-form.ivu-form.ivu-form-label-top {
.ivu-form-item-label{
            color: #fff;
          }
.ivu-row {
.ivu-upload.ivu-upload-drag {
              background-color: transparent;
              &:hover {
                border-color: #ff6b00;
              }
            }
          }
.ivu-form-item-content {
            button {
              &:focus {
               box-shadow: none;
              }
            }
          }
        }
      }
.ivu-modal-body {
.apply-note {
          button {
            &:focus {
              box-shadow: none;
            }
          }
        }
      }
.ivu-modal-footer {
        border: none;
.ivu-btn-primary {
          background-color: #ff6b00;
          color: #fff;
          border-color: #f0ac70;
        }
.ivu-btn-text {
          &:hover,
          &:focus {
            color: #ff6b00;
          }
        }
      }
    }
  }
}
.ivu-btn-primary {
  background: #ff6b00;
  border: 1px solid #ff6b00;
  &:hover {
    background: #ff6b00;
    border: 1px solid #ff6b00;
  }
}
.ivu-btn-text {
  &:hover {
    color: #ff6b00;
  }
}
.ivu-checkbox-checked.ivu-checkbox-inner {
  background-color: #ff6b00!important;
  border: 1px solid #ff6b00!important;
}
li.ivu-upload-list-file.ivu-upload-list-file-finish {
  &:hover {
    span {
      color: #ff6b00;
    }
  }
}

.content {
.apply-step.ivu-steps.ivu-steps-horizontal {
.ivu-steps-item.ivu-steps-status-finish {
.ivu-steps-tail {
        i {
          &:after {
            background: #ff6b00;
          }
        }
      }
.ivu-steps-head {
.ivu-steps-head-inner {
          background-color: #ff6b00;
          border-color: #ff6b00;
        }
      }
.ivu-steps-main {
        display: inline-block;
.ivu-steps-title {
          color: #fff;
        }
      }
    }
.ivu-steps-item.ivu-steps-status-process {
.ivu-steps-head {
.ivu-steps-head-inner {
          background-color: #ff6b00;
          border-color: #ff6b00;
        }
      }
    }
  }
}
</style>


