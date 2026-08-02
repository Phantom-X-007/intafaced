<template>
  <div class="login_form">
    <div class="login_right">
      <Form ref="formInline" :model="formInline" :rules="ruleInline" inline aria-label="Sign in">
        <div class="login_title">{{$t('uc.login.login')}}</div>
        <p class="ix-login-honest" role="note">
          Custodial sign-in. Failed auth is an error — never a silent empty session.
        </p>
        <FormItem prop="user">
          <Input name="user" type="text" v-model="formInline.user" :placeholder="$t('uc.login.usertip')" class="user" autocomplete="username">
            <Select v-model="country" slot="prepend" style="width: 65px" aria-label="Country code">
              <Option value="+86" label="+86"><span>+86</span><span style="margin-left:10px;color:#ccc">China</span></Option>
              <Option value="+65" label="+65"><span>+65</span><span style="margin-left:10px;color:#ccc">Singapore</span></Option>
              <Option value="+82" label="+82"><span>+82</span><span style="margin-left:10px;color:#ccc">South Korea</span></Option>
              <Option value="+81" label="+81"><span>+81</span><span style="margin-left:10px;color:#ccc">Japan</span></Option>
              <Option value="+66" label="+66"><span>+66</span><span style="margin-left:10px;color:#ccc">Thailand</span></Option>
              <Option value="+7" label="+7"><span>+7</span><span style="margin-left:10px;color:#ccc">Russia</span></Option>
              <Option value="+44" label="+44"><span>+44</span><span style="margin-left:10px;color:#ccc">United Kingdom</span></Option>
              <Option value="+84" label="+84"><span>+84</span><span style="margin-left:10px;color:#ccc">Vietnam</span></Option>
              <Option value="+91" label="+91"><span>+91</span><span style="margin-left:10px;color:#ccc">India</span></Option>
              <Option value="+39" label="+39"><span>+39</span><span style="margin-left:10px;color:#ccc">Italy</span></Option>
              <Option value="+852" label="+852"><span>+852</span><span style="margin-left:10px;color:#ccc">Hong Kong</span></Option>
              <Option value="+60" label="+60"><span>+60</span><span style="margin-left:10px;color:#ccc">Malaysia</span></Option>
              <Option value="+886" label="+886"><span>+886</span><span style="margin-left:10px;color:#ccc">Taiwan</span></Option>
              <Option value="+90" label="+90"><span>+90</span><span style="margin-left:10px;color:#ccc">Turkey</span></Option>
            </Select>
          </Input>
        </FormItem>
        <FormItem prop="password" class="password">
          <Input type="password" v-model="formInline.password" :placeholder="$t('uc.login.pwdtip')" @on-keyup="onKeyup" autocomplete="current-password">
          </Input>
        </FormItem>
        <p id="notice" class="hide" role="alert" aria-live="polite">{{$t('uc.login.validatemsg')}}</p>
        <p style="height:30px;">
          <router-link to="/findPwd" style="color:#979797;float:right;padding-right:10px;font-size:12px;">
            {{$t('uc.login.forget')}}
          </router-link>
        </p>
        <FormItem style="margin-bottom:15px;">
          <Button class="login_btn">{{$t('uc.login.login')}}</Button>
        </FormItem>
        <div class='to_register'>
          <span>{{$t('uc.login.noaccount')}}</span>
          <router-link to="/register">{{$t('uc.login.goregister')}}</router-link>
        </div>
      </Form>

    </div>
  </div>
</template>
<style scoped lang="scss">
/* captcha */
.login_form {
  /* P21 modular tokens with fallbacks — swap palette without rewriting this page */
  background: var(--ix-bg, #0a0c10) url(../../assets/images/login_bg.png) no-repeat center center;
  height: 760px;
  position: relative;
  overflow: hidden;
.login_right {
    padding: 20px 30px 20px 30px;
    position: absolute;
    background: var(--ix-surface, #12151c);
    width: 350px;
    height: 330px;
    left: 50%;
    top: 50%;
    margin-left: -175px;
    margin-top: -165px;
    border-top: 4px solid var(--ix-orange, #00c2a8);
    border-radius: 5px;
    form.ivu-form.ivu-form-label-right.ivu-form-inline {
.login_title{
        height: 70px;
        color: var(--ix-text, #e8ebf0);
      }
.ivu-form-item {
.ivu-form-item-content {
.login_btn.ivu-btn {
            width: 100%;
            background-color: var(--ix-orange, #00c2a8);
            outline: none;
            border-color: var(--ix-orange, #00c2a8);
            color: var(--ix-on-accent, #041210);
            font-size: 18px;
            border-radius: 5px;
            &:focus-visible {
              outline: 2px solid var(--ix-orange-light, #1ad4bc);
              outline-offset: 2px;
            }
          }
        }
      }
    }
  }
.to_register {
    overflow: hidden;
    font-size: 12px;
    span {
      float: left;
      color: var(--ix-text-dim, #8a909c);
    }
    a {
      float: right;
      color: var(--ix-orange, #00c2a8);
    }
  }
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
.geetest_wait_dot geetest_dot_1 {
  color: red;
}
.user.ivu-btn,
.ivu-btn:active,
.ivu-btn:focus {
  border-color: #d7dde4;
  box-shadow: none;
}
/* */

.login_right {
  background: var(--ix-surface-solid, #0d0d0d) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: 1px solid var(--ix-hairline, rgba(255,255,255,0.09));
  border-radius: var(--ix-radius, 14px);
  box-shadow: 0 16px 48px rgba(0,0,0,0.55);
}
.ix-login-honest {
  margin: -8px 0 14px;
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--ix-text-dim, #8a909c);
  border-left: 2px solid var(--ix-orange, #00c2a8);
  background: rgba(0, 194, 168, 0.06);
}
</style>
<script>
import gtInit from "../../assets/js/gt.js";
import $ from "jquery";
export default {
  data() {
    return {
      country: "+86",
      captchaObj: null,
      _captchaResult: null,
      formInline: {
        user: "",
        password: ""
      },
      ruleInline: {
        user: [
          {
            required: true,
            message: this.$t("uc.login.loginvalidate"),
            trigger: "blur"
          }
        ],
        password: [
          {
            required: true,
            message: this.$t("uc.login.pwdvalidate1"),
            trigger: "blur"
          },
          {
            type: "string",
            min: 6,
            message: this.$t("uc.login.pwdvalidate2"),
            trigger: "blur"
          }
        ]
      }
    };
  },
  created: function() {
    this.init();
  },
  computed: {
    isLogin: function() {
      return this.$store.getters.isLogin;
    }
  },
  methods: {
    init() {
      this.$store.commit("navigate", "nav-other");
      this.$store.state.HeaderActiveName = "0";

      if (this.isLogin) {
        this.$router.push("/uc/safe");
      } else {
        this.initGtCaptcha();
      }
    },
    onKeyup(ev) {
      if (ev.keyCode == 13) {
        $(".login_btn").click();
      }
    },
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
            this.handleSubmit("formInline");
          }
        });
      $(".login_btn").click(() => {
        let reg = /^[1][3,4,5,6,7,8,9][0-9]{9}$/,
          tel = this.formInline.user,
          flagtel = reg.test(tel),
          flagpass = this.formInline.password.length >= 6? true: false;
        flagtel && flagpass && captchaObj.verify();
        (!flagtel ||!flagpass) && this.$Message.error("Please complete every field");
      });
    },
    logout() {
      this.$http.post(this.host + "/uc/logout", {}).then(response => {
        var resp = response.body;
        if (resp.code == 0) {
          localStorage.setItem("MEMBER", JSON.stringify(null));
          localStorage.setItem("TOKEN", null);
          localStorage.removeItem("USERKEY", null);
        } else {
          // this.$Message.error(resp.message);
        }
      });
    },
    handleSubmit(name) {
      var result = this._captchaResult;
      if (!result) {
        $("#notice").show();
        setTimeout(function() {
          $("#notice").hide();
        }, 2000);
      } else {
        this.$refs[name].validate(valid => {
          if (valid) {
            var params = {};
            params["username"] = this.formInline.user;
            params["password"] = this.formInline.password;
            this.$http.post(this.host + this.api.uc.login, params).then(response => {
                var resp = response.body;
                if (resp.code == 0) {
                  this.$Message.success(this.$t("uc.login.success"));
                  this.$store.commit("setMember", response.body.data);
                  if (this.$route.query.key!= null && this.$route.query.key!= "") {
                    localStorage.setItem("USERKEY", this.$route.query.key);
                  }
                  this.$router.push("/uc/safe");
                } else {
                  this.$Message.error(resp.message);
                }
              });
          } else {

          }
        });
      }
    }
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
              background-color:transparent;
              font-size: 14px;
              border: none;
              border-bottom: 1px solid #141414;
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
    }
  }
}

.ivu-select-single.ivu-select-selection.ivu-select-placeholder,.ivu-select-single.ivu-select-selection.ivu-select-selected-value{
  padding-right: 10px;
  padding-left: 3px;
}
.ivu-select-single.ivu-select-selection.ivu-select-arrow{
  right: 2px;
}

.ivu-form-item-error.ivu-input-group-append,.ivu-form-item-error.ivu-input-group-prepend{
  background-color: #171717;
  border-color: transparent;
}
.ivu-form-item-error.ivu-select-arrow{
  color: #808695;
}

.login_right.ivu-select-dropdown{
  background: #1d1d1d;
}
</style>
<style>
.ivu-select-single.ivu-select-selection.ivu-select-placeholder,.ivu-select-single.ivu-select-selection.ivu-select-selected-value{
    padding-right: 20px;
  }
.ivu-select-arrow{
    right: 4px;
  }

.ivu-select-item span:first-child{
    display: inline-block;
    width: 30px;
    text-align: left;
  }
</style>
