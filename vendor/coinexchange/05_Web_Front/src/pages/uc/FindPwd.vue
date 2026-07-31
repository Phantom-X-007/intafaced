<template>
  <div class="login_form">
    <div class="login_right">
      <Form ref="formInline" :model="formInline" :rules="ruleInline" inline>
        <FormItem style="text-align:center;">
          <ButtonGroup>
            <!-- <Button v-for="(list,index) in buttonLists" :key="list.text" :class="{ active:changeActive == index}" @click="actives(index)">{{list.text}}</Button> -->
            <div class="tel-title">{{$t('uc.login.getlostpwd')}}</div>
          </ButtonGroup>
        </FormItem>
        <FormItem prop="user">
          <Input type="text" v-model="formInline.user" :placeholder="$t('uc.login.usertip')">
          </Input>
        </FormItem>
        <FormItem prop="code">
          <Input type="text" v-model="formInline.code" :placeholder="$t('uc.regist.smscode')">
          </Input>
          <input id="sendCode" type="Button" :value="sendcodeValue" :disabled="codedisabled">
          </input>
        </FormItem>
        <FormItem prop="password" class="password">
          <Input type="password" v-model="formInline.password" :placeholder="$t('uc.forget.newpwd')">
          </Input>
        </FormItem>
        <FormItem prop="repassword" class="password">
          <Input type="password" v-model="formInline.repassword" :placeholder="$t('uc.forget.confirmpwd')">
          </Input>
        </FormItem>
        <FormItem>
          <Button class="login_btn" @click="handleSubmit('formInline')">{{$t('uc.forget.save')}}</Button>
        </FormItem>
      </Form>
    </div>
    <Modal v-model="modal1" :mask-closable="false">
      <p slot="header" style="text-align:center">{{$t('uc.regist.modaltitle')}}</p>
      <div style="text-align:center">
        <div>
          <div id="captcha">
            <p id="wait" class="show">{{$t('uc.login.validatecodeload')}}......</p>
          </div>
        </div>
        <p id="notice" class="hide">{{$t('uc.login.validatemsg')}}</p>
      </div>
      <p slot="footer"></p>
    </Modal>
  </div>
</template>
<style scoped lang="scss">
.login_form {
  background: #0e0e0e url(../../assets/images/login_bg.png) no-repeat center center;
  height: 760px;
  position: relative;
  overflow: hidden;
.login_right {
    padding: 20px 30px;
    position: absolute;
    background: #171717;
    width: 350px;
    height: auto;
    left: 50%;
    top: 50%;
    margin-left: -175px;
    margin-top: -205px;
    border-radius: 5px;
    border-top: 4px solid #1ad4bc;
.tel-title{
      font-size:25px;
      color: #fff;
    }
    form.ivu-form.ivu-form-label-right.ivu-form-inline {
.ivu-form-item {
.ivu-form-item-content {
.login_btn.ivu-btn {
            width: 100%;
            outline: none;
            font-size:18px;
            border-radius: 30px;
          }
.ivu-input-wrapper.ivu-input-type {
.ivu-input {
              border: 1px solid red;
            }
          }
          #sendCode {
            position: absolute;
            border: 1px solid #1ad4bc;
            background: transparent;
            top: -10px;
            outline: none;
            right: 0;
            width: 30%;
            color: #d5851d;
            cursor: pointer;
          }
        }
      }
    }
  }
}
/* captcha */
#captcha {
  width: 100%;
  display: inline-block;
}
.show {
  display: block;
}
.hide {
  display: none;
}
#notice {
  color: red;
}
#wait {
  text-align: left;
  color: #666;
  margin: 0;
}
</style>
<script>
import gtInit from "../../assets/js/gt.js";
import $ from "jquery";
export default {
  data() {
    const validateUser = (rule, value, callback) => {
      if (this.changeActive == 0) {
        var reg = /^[1][3,4,5,6,7,8,9][0-9]{9}$/;
        if (value == "") {
          callback(new Error(this.$t("uc.regist.teltip")));
        } else if (!reg.test(this.formInline.user)) {
          callback(new Error(this.$t("uc.regist.telerr")));
        } else {
          callback();
        }
      } else {
        var reg = /^[a-z0-9]+([._\\-]*[a-z0-9])*@([a-z0-9]+[-a-z0-9]*[a-z0-9]+.){1,63}[a-z0-9]+$/;
        reg = /^(\w)+(\.\w+)*@(\w)+((\.\w{2,3}){1,3})$/;
        if (value == "") {
          callback(new Error(this.$t("uc.regist.emailtip")));
        } else if (!reg.test(this.formInline.user)) {
          callback(new Error(this.$t("uc.regist.emailerr")));
        } else {
          callback();
        }
      }
    };
    const validateRepassword = (rule, value, callback) => {
      if (value === "") {
        callback(new Error(this.$t("uc.forget.pwdvalidate1")));
      } else if (value!== this.formInline.password) {
        callback(new Error(this.$t("uc.forget.pwdvalidate2")));
      } else {
        callback();
      }
    };
    return {
      codedisabled:false,
      sendcodeValue: this.$t("uc.regist.sendcode"),
      captchaObj: null,
      modal1: false,
      _captchaResult: null,
      buttonLists: [
        {
          text: this.$t("uc.forget.resettelpwd")
        }
      ],
      changeActive: 0,
      countdown: 60,
      formInline: {
        user: "",
        code: "",
        password: "",
        repassword: ""
      },
      ruleInline: {
        user: [{ validator: validateUser, trigger: "blur" }],
        code: [{ required: true, message: "Enter the verification code", trigger: "blur" }],
        password: [
          {
            required: true,
            message: this.$t("uc.forget.newpwdtip"),
            trigger: "blur"
          },
          {
            type: "string",
            min: 6,
            message: this.$t("uc.forget.pwdvalidate3"),
            trigger: "blur"
          }
        ],
        repassword: [
          { validator: validateRepassword, trigger: "blur" },
          {
            type: "string",
            min: 6,
            message: this.$t("uc.forget.pwdvalidate3"),
            trigger: "blur"
          }
        ]
      },
      key: "",
      code: ""
    };
  },
  watch: {
    changeActive: function(val) {
      this.$refs["formInline"].resetFields();
      // if (val == 0) this.initGtCaptcha();
    }
  },
  created: function() {
    this.init();
    // this.actives(this.changeActive);
  },
  computed: {
    isLogin: function() {
      return this.$store.getters.isLogin;
    }
  },
  methods: {
    init() {
      if (this.isLogin) {
        this.$router.push("/");
      } else {
        this.$store.state.HeaderActiveName = "1-4";
      }
      this.initGtCaptcha();
    },
    // actives: function(index) {
    // this.changeActive = index;
    // if (this.changeActive == 0) {
    // this.key = this.$t("uc.forget.telno");
    // this.code = this.$t("uc.forget.smscode");
    // this.ruleInline.user[0].message = this.$t("uc.forget.teltip");
    // this.ruleInline.code[0].message = this.$t("uc.forget.smscodetip");
    // } else {
    // this.key = this.$t("uc.forget.email");
    // this.code = this.$t("uc.forget.emailcode");
    // this.ruleInline.user[0].message = this.$t("uc.forget.emailtip");
    // this.ruleInline.code[0].message = this.$t("uc.forget.emailcodetip");
    // }
    // },

    // initGtCaptcha() {
    // var that = this;
    // this.$http.get(this.host + this.api.uc.captcha).then(function(res) {
    // window.initGeetest(
    // {
    // //  SDK
    // gt: res.body.gt,
    // challenge: res.body.challenge,
    // offline:!res.body.success, //whether the captcha service is detected as down
    // new_captcha: res.body.new_captcha, //marks a fallback captcha issued during an outage
    // product: "popup",
    // width: "100%"
    // },
    // function(captchaObj) {
    // captchaObj.onSuccess(function() {
    // that._captchaResult = captchaObj.getValidate();
    // that.afterValidate();
    // });
    // // idcaptcha, :input
    // captchaObj.appendTo("#captcha");
    // that.captchaObj = captchaObj;
    // captchaObj.onReady(function() {
    // $("#wait").hide();
    // });
    // }
    //);
    // });
    // },
    initGtCaptcha() {
      var that = this;
      this.$http.get(this.host + this.api.uc.captcha).then(function(res) {
        window.initGeetest(
          {
            // SDK
            gt: res.body.gt,
            challenge: res.body.challenge,
            offline:!res.body.success, //whether the captcha service is detected as down
            new_captcha: res.body.new_captcha, //marks a fallback captcha issued during an outage
            product: "bind",
            width: "100%"
          },
          this.handler
);
      });
    },
    handler(captchaObj) {
      captchaObj.onReady(() => {
          $("#wait").hide();
        }).onSuccess(() => {
          let result = (this._captchaResult = captchaObj.getValidate());
          if (!result) {
            this.$Message.error("Please complete the verification");
          } else {
            this.afterValidate();
          }
        });
      $("#sendCode").click(()=> {
         let reg = /^[1][3,4,5,6,7,8,9][0-9]{9}$/,
         tel = this.formInline.user,
         flagtel = reg.test(tel);
         flagtel && captchaObj.verify();
!flagtel && this.$Message.error("Enter a valid phone number");
      });
    },
    afterValidate() {
      this.modal1 = false;
      if (this.changeActive == 1) {
        //send email
        var params = {};
        params["account"] = this.formInline.user;
        params["geetest_challenge"] = this._captchaResult.geetest_challenge; //captcha second-stage form data: challenge
        params["geetest_validate"] = this._captchaResult.geetest_validate; //captcha second-stage form data: validate
        params["geetest_seccode"] = this._captchaResult.geetest_seccode; //captcha second-stage form data: seccode

        this.$http.post(this.host + "/uc/reset/email/code", params).then(response => {
            this.countdown = 60;
            var resp = response.body;
            if (resp.code == 0) {
              this.$Notice.success({
                title: this.$t("common.tip"),
                desc: resp.message
              });
            } else {
              this.$Notice.error({
                title: this.$t("common.tip"),
                desc: resp.message
              });
            }
          });
      } else {
        var params = {};
        params["account"] = this.formInline.user;
        params["geetest_challenge"] = this._captchaResult.geetest_challenge; //captcha second-stage form data: challenge
        params["geetest_validate"] = this._captchaResult.geetest_validate; //captcha second-stage form data: validate
        params["geetest_seccode"] = this._captchaResult.geetest_seccode; //captcha second-stage form data: seccode
        this.$http.post(this.host + "/uc/mobile/reset/code", params).then(response => {
            var resp = response.body;
            if (resp.code == 0) {
              this.settime();
              this.$Notice.success({title: this.$t("common.tip"),desc: resp.message });
            } else {
              this.$Notice.error({title: this.$t("common.tip"),desc: resp.message});
            }
          });
      }
    },
    handleSubmit(name) {
      this.$refs[name].validate(valid => {
        if (valid) {
          if (this.changeActive == 1) {
            var params = {};
            params["account"] = this.formInline.user;
            params["code"] = this.formInline.code;
            params["mode"] = 1;
            params["password"] = this.formInline.password;
            this.$http
.post(this.host + "/uc/reset/login/password", params)
.then(response => {
                this.countdown = 60;
                var resp = response.body;
                if (resp.code == 0) {
                  this.$Notice.success({
                    title: this.$t("common.tip"),
                    desc: resp.message
                  });
                  this.$router.push("/login");
                } else {
                  this.$Notice.error({
                    title: this.$t("common.tip"),
                    desc: resp.message
                  });
                }
              });
          } else {
            var params = {};
            params["account"] = this.formInline.user;
            params["code"] = this.formInline.code;
            params["mode"] = 0;
            params["password"] = this.formInline.password;
            this.$http
.post(this.host + "/uc/reset/login/password", params)
.then(response => {
                var resp = response.body;
                if (resp.code == 0) {
                  this.$Notice.success({
                    title: this.$t("common.tip"),
                    desc:'Reset complete'
                  });
                  this.$router.push("/login");
                } else {
                  this.$Notice.error({
                    title: this.$t("common.tip"),
                    desc: resp.message
                  });
                }
              });
          }
          // this.$Message.success(this.$t('uc.forget.resetpwdsuccess'));
        } else {
        }
      });
    },
    settime() {
      this.sendcodeValue = this.countdown;
      this.codedisabled = true;
      let timercode = setInterval(() => {
        this.countdown--;
        this.sendcodeValue = this.countdown;
        if (this.countdown <= 0) {
          clearInterval(timercode);
          this.codedisabled = false;
          this.sendcodeValue = this.$t("uc.regist.sendcode");
          this.countdown = 60;
        }
      }, 1000);
    },
    // sendCode() {
    // this.settime();
    // var mobilePhone = this.formInline.user;
    // if (mobilePhone == "") {
    // this.countdown = 0;
    // this.$Notice.error({
    // title: this.$t("common.tip"),
    // desc: this.ruleInline.user[0].message
    // });
    // return;
    // }
    // this.openValidateModal();
    // },

    // openValidateModal() {
    // if (this.captchaObj!= null && this.captchaObj.reset) {
    // this.captchaObj.reset();
    // } else {
    // this.initGtCaptcha();
    // }
    // this.modal1 = true;
    // }
  }
};
</script>
<style lang="scss">
.login_form {
.login_right {
    form.ivu-form.ivu-form-label-right.ivu-form-inline {
.ivu-form-item {
.ivu-form-item-content {
.ivu-input-wrapper.ivu-input-type {
.ivu-input {
              border: none;
              border-bottom: 1px solid #141414;
              font-size:14px;
              background:transparent;
              border-radius:0;
              &:focus {
                border: none;
                border-bottom: 1px solid #141414;
                -moz-box-shadow: 2px 2px 5px transparent, -2px -2px 4px transparent;
                -webkit-box-shadow: 2px 2px 5px transparent, -2px -2px 4px transparent;
                box-shadow: 2px 2px 5px transparent, -2px -2px 4px transparent;
              }
            }
          }
        }
      }
    }
  }
}
</style>
