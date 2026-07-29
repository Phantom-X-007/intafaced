<template>
  <div class="login_form">
    <div class="login_right">
      <Form v-if="allowRegister" ref="formInline" :model="formInline" :rules="ruleInline" inline>
        <FormItem style="text-align:center;">
          <ButtonGroup>
            <div class="tel-title">{{$t('uc.regist.regist')}}</div>
          </ButtonGroup>
        </FormItem>
        <FormItem prop="username" style="display:none;">
          <Input type="text" v-model="formInline.username" :placeholder="$t('uc.regist.username')">
          </Input>
        </FormItem>
        <FormItem prop="user">
          <Input type="text" v-model="formInline.user" :placeholder="key">
            <Select v-model="country" slot="prepend" style="width: 65px;border-bottom: 1px solid #141414;">
              <Option value="China" label="+86"><span>+86</span><span style="margin-left:10px;color:#ccc">{{$t('country.china')}}</span></Option>
              <Option value="Singapore" label="+65"><span>+65</span><span style="margin-left:10px;color:#ccc">{{$t('country.singapore')}}</span></Option>
              <Option value="South Korea" label="+82"><span>+82</span><span style="margin-left:10px;color:#ccc">{{$t('country.southkorea')}}</span></Option>
              <Option value="Japan" label="+81"><span>+81</span><span style="margin-left:10px;color:#ccc">{{$t('country.japan')}}</span></Option>
              <Option value="Thailand" label="+66"><span>+66</span><span style="margin-left:10px;color:#ccc">{{$t('country.thailand')}}</span></Option>
              <Option value="Russia" label="+7"><span>+7</span><span style="margin-left:10px;color:#ccc">{{$t('country.russia')}}</span></Option>
              <Option value="United Kingdom" label="+44"><span>+44</span><span style="margin-left:10px;color:#ccc">{{$t('country.unitedkingdom')}}</span></Option>
              <Option value="Vietnam" label="+84"><span>+84</span><span style="margin-left:10px;color:#ccc">{{$t('country.vietnam')}}</span></Option>
              <Option value="India" label="+91"><span>+91</span><span style="margin-left:10px;color:#ccc">{{$t('country.india')}}</span></Option>
              <Option value="Italy" label="+39"><span>+39</span><span style="margin-left:10px;color:#ccc">{{$t('country.italy')}}</span></Option>
              <Option value="Hong Kong" label="+852"><span>+852</span><span style="margin-left:10px;color:#ccc">{{$t('country.hongkong')}}</span></Option>
              <Option value="Malaysia" label="+60"><span>+60</span><span style="margin-left:10px;color:#ccc">{{$t('country.malaysia')}}</span></Option>
              <Option value="Taiwan" label="+886"><span>+886</span><span style="margin-left:10px;color:#ccc">{{$t('country.taiwan')}}</span></Option>
              <Option value="Turkey" label="+90"><span>+90</span><span style="margin-left:10px;color:#ccc">{{$t('country.turkey')}}</span></Option>
            </Select>
          </Input>
        </FormItem>

        <FormItem prop="code" v-show="showCode">
          <Input type="text" v-model="formInline.code" :placeholder="$t('uc.regist.smscode')">
          </Input>
          <input id="sendCode" @click="sendCode();" type="Button" shape="circle" :value="sendcodeValue" :disabled='codedisabled'>
          </input>
        </FormItem>
        <FormItem prop="password" class="password">
          <Input type="password" v-model="formInline.password" :placeholder="$t('uc.regist.pwd')">
          </Input>
        </FormItem>
        <FormItem prop="repassword" class="password">
          <Input type="password" v-model="formInline.repassword" :placeholder="$t('uc.regist.repwd')">
          </Input>
        </FormItem>
        <FormItem prop="promotion">
          <Input type="text" v-model="formInline.promotion">
            <span slot="prepend">{{$t('uc.regist.promotion')}}:</span>
          </Input>
        </FormItem>
        <div class="check-agree" style="">
          <label>
            <Checkbox v-model="agree">{{$t('uc.regist.agreement')}}</Checkbox>
          </label>
          <a v-if="false" href="/helpdetail?cate=1&id=5&cateTitle=FAQ" target="_blank" style="">{{$t('uc.regist.userprotocol')}}</a>
          <a v-if="lang=='English'" href="/helpdetail?cate=1&id=35&cateTitle=Privacy Policy" target="_blank" style="">{{$t('uc.regist.userprotocol')}}</a>
        </div>
        <FormItem>
          <Button class="register_btn" @click="handleSubmit('formInline')" :disabled="registing">{{$t('uc.regist.regist')}}</Button>
        </FormItem>
      </Form>
      <Alert v-else type="warning">
        {{$t('uc.regist.closedtitle')}}
        <template slot="desc">
          {{$t('uc.regist.closeddesc')}}
        </template>
      </Alert>
    </div>
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
    height: 485px;
    left: 50%;
    top: 50%;
    margin-left: -175px;
    margin-top: -205px;
    border-top: 4px solid #ff8534;
    border-radius: 5px;
.tel-title{
      color: #fff;
    }
    form.ivu-form.ivu-form-label-right.ivu-form-inline {
.ivu-form-item {
.ivu-form-item-content {
.register_btn.ivu-btn {
            width: 100%;
            background-color: #ff8534;
            outline: none;
            border-color: #ff8534;
            color: #fff;
            border-radius: 5px;
            font-size: 18px;
            margin-top: 20px;
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
          #sendCode {
            position: absolute;
            border: 1px solid #ff8534;
            background: transparent;
            top: -10px;
            outline: none;
            right: 0;
            width: 30%;
            color: #ff8534;
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
          color: #ff8534;
          margin-left: -10px;
        }
.ivu-checkbox-wrapper.ivu-checkbox-wrapper-checked {
.ivu-checkbox.ivu-checkbox-checked {
.ivu-checkbox-inner {
              border: 1px solid #ff8534;
              background-color: #ff8534;
            }
          }
        }
      }
    }
  }
}

.login_title {
  text-align: center;
  height: 80px;
  font-size: 25px;
}

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
.tel-title {
  font-size: 25px;
}
.login_left {
  display: none;
}
</style>
<script>
// import gtInit from '../../assets/js/gt.js';
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
        callback(new Error(this.$t("uc.regist.confirmpwdtip")));
      } else if (value!== this.formInline.password) {
        callback(new Error(this.$t("uc.regist.confirmpwderr")));
      } else {
        callback();
      }
    };
    return {
      country: "China",
      codedisabled:false,
      sendcodeValue: this.$t("uc.regist.sendcode"),
      isRegister: false,
      ticket: "",
      randStr: "",
      registing: false,
      captchaObj: null,
      modal1: false,
      _captchaResult: null,
      agree: true,
      allowRegister: true,
      buttonLists: [
        {
          text: this.$t("uc.regist.telregist")
        },
        {
          text: this.$t("uc.regist.emailregist")
        }
      ],
      areas: [],
      changeActive: 0,
      showCode: true,
      countdown: 60,
      formInline: {
        username: "",
        // country: "",
        user: "",
        code: "",
        areaCode: "",
        password: "",
        repassword: "",
        promotion: ""
      },
      ruleInline: {
        user: [{ validator: validateUser, trigger: "blur" }],
        code: [
          {
            required: true,
            message: this.$t("uc.regist.smscodetip"),
            trigger: "blur"
          }
        ],
        password: [
          {
            required: true,
            message: this.$t("uc.regist.pwdtip"),
            trigger: "blur"
          },
          {
            type: "string",
            min: 6,
            message: this.$t("uc.regist.pwdmsg"),
            trigger: "blur"
          }
        ],
        repassword: [{ validator: validateRepassword, trigger: "blur" }]
      },
      key: "",
      code: ""
    };
  },
  watch: {
    changeActive: function(val) {
      this.$refs["formInline"].resetFields();
      // if (val == 0) this.initGtCaptcha();
    },
    lang: function() {
      this.updateLangData();
    }
  },
  computed: {
    lang: function() {
      return this.$store.state.lang;
    },
    isLogin: function() {
      return this.$store.getters.isLogin;
    }
  },
  created: function() {
    window.scrollTo(0, 0);
    // var oDiv = document.getElementById("example-navbar-collapse");
    // oDiv && (oDiv.className = "navbar-collapse collapse");
    this.init();
    this.actives(this.changeActive);
    if(this.$route.query.code!= undefined && this.$route.query.code!= "" && this.$route.query.code!= null){
        this.formInline.promotion = this.$route.query.code;
    }else{
        this.formInline.promotion = "";
    }
  },
  methods: {
    updateLangData() {
      this.buttonLists = [
        {
          text: this.$t("uc.regist.telregist")
        },
        {
          text: this.$t("uc.regist.emailregist")
        }
      ];

      if (this.changeActive == 0) {
        this.key = this.$t("uc.regist.telno");
      } else {
        this.key = this.$t("uc.regist.email");
      }
    },
    init() {
      this.$store.commit("navigate", "nav-other");
      this.$store.state.HeaderActiveName = "0";
      if (this.isLogin) {
        this.$router.push("/");
      }
      // this.getAreas();
      // this.initGtCaptcha();
    },
    initGtCaptcha() {
      var self = this;
      var captcha1 = new TencentCaptcha("2031827463", function(res) {
        res.ret == 0 &&
          (self.isRegister = true) &&
          (self.ticket = res.ticket) &&
          (self.randStr = res.randstr) &&
          self.success();
      });
      captcha1.show(); // Show captcha
    },
    onAreaChange(value) {
      for (var i = 0; i < this.areas.length; i++) {
        if (this.areas[i].zhName == value) {
          this.formInline.areaCode = this.areas[i].areaCode;
        }
      }
    },
    getAreas() {
      this.$http.post(this.host + this.api.common.area).then(response => {
        var resp = response.body;
        this.areas = resp.data;
        this.formInline.country = this.areas[0].zhName;
        this.formInline.areaCode = this.areas[0].areaCode;
      });
    },
    actives: function(index) {
      this.changeActive = index;
      if (this.changeActive == 0) {
        this.showCode = true;
        this.key = this.$t("uc.regist.telno");
        this.ruleInline.code = [
          {
            required: true,
            message: this.$t("uc.regist.smscodetip"),
            trigger: "blur"
          }
        ];
      } else {
        this.showCode = false;
        this.key = this.$t("uc.regist.email");
        this.ruleInline.code = [];
      }
    },
    handleSubmit(name) {
      this.$refs[name].validate(valid => {
        if (valid) {
          if (this.agree == true) {
            if (this.changeActive == 1) {
              this.openValidateModal();
            } else {
              if (this.isRegister) {
                this.registing = true;
                var params = {};
                params["phone"] = this.formInline.user;
                params["username"] = this.formInline.username + this.formInline.user;
                params["password"] = this.formInline.password;
                params["promotion"] = this.formInline.promotion; // Invite code
                params["code"] = this.formInline.code;
                params["country"] = this.country;//"China";
                params["superPartner"] = "";//this.formInline.superType;
                params["ticket"] = this.ticket;
                params["randStr"] = this.randStr;

                this.$http
.post(this.host + "/uc/register/phone", params)
.then(response => {
                    this.registing = false;
                    var resp = response.body;
                    if (resp.code == 0) {
                      if (
                        this.formInline.superType == "1" ||
                        this.formInline.superType == "2"
) {
                        this.$Notice.success({
                          title: this.$t("common.tip"),
                          desc: this.$t("uc.regist.complete")
                        });
                        var that = this;
                        setTimeout(() => {
                          that.$router.push("/");
                        }, 3000);
                      } else {
                        this.$Notice.success({
                          title: this.$t("common.tip"),
                          desc: resp.message
                        });
                        var that = this;
                        setTimeout(() => {
                          that.$router.push("/login");
                        }, 3000);
                      }
                    } else {
                      this.$Notice.error({
                        title: this.$t("common.tip"),
                        desc: resp.message
                      });
                    }
                  });
              } else {
                this.$Notice.error({
                  title: this.$t("common.tip"),
                  desc: this.$t("uc.regist.codeinvalid")
                });
              }
            }
          } else {
            this.$Notice.error({
              title: this.$t("common.tip"),
              desc: this.$t("uc.regist.agreementtip")
            });
          }
        }
      });
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
    sendCode() {
      var mobilePhone = this.formInline.user;
      let reg = /^[1][3,4,5,6,7,8,9][0-9]{9}$/;
      if (mobilePhone == "" ||!reg.test(mobilePhone)) {
        this.$Message.error(this.$t("uc.regist.teltip"));
        return;
      } else {
        this.initGtCaptcha();
      }
    },
    success() {
      var params = {};
      params["phone"] = this.formInline.user;
      params["country"] = "China";
      var reg = /^[1][3,4,5,6,7,8,9][0-9]{9}$/;
      reg.test(params["phone"]) && this.$http.post(this.host + "/uc/mobile/code", params).then(response => {
            var resp = response.body;
            resp.code == 0 && this.$Notice.success({title: this.$t("common.tip"),desc: resp.message});
            resp.code == 0 && this.settime();
            resp.code!= 0 && this.$Notice.error({title: this.$t("common.tip"),desc: resp.message});
          });
!reg.test(params["phone"]) &&this.$Notice.error({title: this.$t("common.tip"),desc: this.$t("uc.finance.withdraw.telerr")});
    }
  }
};
</script>
<style lang="scss">
.login_form {
.login_right {
    form.ivu-form.ivu-form-label-right.ivu-form-inline {
      text-align:center;
.ivu-form-item {
.ivu-form-item-content {
.ivu-input-wrapper.ivu-input-type {
.ivu-input {
              border: none;
              border-bottom: 1px solid #141414;
              font-size: 14px;
              background:transparent;
              border-radius:0;
              // color:#fff;
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
.check-agree {
.ivu-checkbox-wrapper {
.ivu-checkbox-input {
            &:focus {
              border: none;
              outline: none;
              -moz-box-shadow: 2px 2px 5px transparent, -2px -2px 4px transparent;
              -webkit-box-shadow: 2px 2px 5px transparent, -2px -2px 4px transparent;
              box-shadow: 2px 2px 5px transparent, -2px -2px 4px transparent;
            }
          }
        }
.ivu-checkbox-wrapper.ivu-checkbox-wrapper-checked {
.ivu-checkbox.ivu-checkbox-checked {
.ivu-checkbox-inner {
              border: 1px solid #ff8534;
              background-color: #ff8534;
            }
          }

        }
.ivu-checkbox-wrapper.ivu-checkbox-default{
.ivu-checkbox{
.ivu-checkbox-inner{
              background:transparent;
            }
          }
        }
      }
    }
  }
}
</style>
<style>
.ivu-select-single.ivu-select-selection.ivu-select-placeholder,.ivu-select-single.ivu-select-selection.ivu-select-selected-value{
    padding-right: 20px;
  }
.ivu-select-arrow{
    right: 4px;
  }
.ivu-form-item-error.ivu-input-group-append,.ivu-form-item-error.ivu-input-group-prepend,.ivu-input-group-append,.ivu-input-group-prepend{
    background-color: #171717;
    border-bottom: 1px solid #141414;
    border-top:none;
    border-left: none;
    border-right: none;
  }

.ivu-select-item span:first-child{
    display: inline-block;
    width: 30px;
    text-align: left;
  }
</style>
