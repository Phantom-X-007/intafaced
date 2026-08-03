<template>
  <div class="login_form">
    <div class="login_right">
      <Form v-if="allowRegister" ref="formInline" :model="formInline" :rules="ruleInline" inline>
        <FormItem style="text-align:center;">
          <ButtonGroup>
            <div class="tel-title">{{$t('uc.regist.regist')}}</div>
          </ButtonGroup>
        </FormItem>
        <p class="ix-login-honest" role="note">
          {{ $t('uc.regist.identityNote') }}
        </p>
        <FormItem prop="handle">
          <Input type="text" v-model="formInline.handle" :placeholder="$t('uc.regist.handle')" autocomplete="username">
          </Input>
        </FormItem>
        <FormItem prop="email">
          <Input type="text" v-model="formInline.email" :placeholder="$t('uc.regist.email')" autocomplete="email">
          </Input>
        </FormItem>
        <FormItem prop="password" class="password">
          <Input type="password" v-model="formInline.password" :placeholder="$t('uc.regist.pwd')" autocomplete="new-password">
          </Input>
        </FormItem>
        <FormItem prop="repassword" class="password">
          <Input type="password" v-model="formInline.repassword" :placeholder="$t('uc.regist.repwd')" autocomplete="new-password">
          </Input>
        </FormItem>
        <FormItem prop="region">
          <Input type="text" v-model="formInline.region" :placeholder="$t('uc.regist.region')" maxlength="2">
          </Input>
        </FormItem>
        <p v-if="registerError" class="ix-login-error" role="alert" aria-live="polite">{{ registerError }}</p>
        <div class="check-agree" style="">
          <label>
            <Checkbox v-model="agree">{{$t('uc.regist.agreement')}}</Checkbox>
          </label>
          <a v-if="lang=='English'" href="/helpdetail?cate=1&id=35&cateTitle=Privacy Policy" target="_blank" style="">{{$t('uc.regist.userprotocol')}}</a>
        </div>
        <FormItem>
          <Button class="register_btn" @click="handleSubmit('formInline')" :loading="registing">{{$t('uc.regist.regist')}}</Button>
        </FormItem>
        <p class="ix-login-socket" role="note">
          {{ $t('uc.regist.referralSocket') }}
        </p>
      </Form>
      <Alert v-else type="warning">
        Registration closed
        <template slot="desc">
          New accounts are not open on this venue yet — closed is not the same as a full book of users.
        </template>
      </Alert>
    </div>
  </div>
</template>
<style scoped lang="scss">
.ix-login-honest {
  margin: 0 0 12px;
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--ix-text-dim, #8a909c);
  border-left: 2px solid var(--ix-orange, #ff6b00);
  background: rgba(255, 107, 0, 0.06);
  text-align: left;
}
.ix-login-error {
  margin: 0 0 10px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.4;
  color: #ffb4a2;
  border-left: 2px solid #e5484d;
  background: rgba(229, 72, 77, 0.08);
  text-align: left;
}
/* A stated absence, not a warning. See IxState's .ix-note-socket. */
.ix-login-socket {
  margin: 14px 0 0;
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--ix-text-faint, #6b7280);
  border-left: 2px solid var(--ix-orange, #ff8a1f);
  text-align: left;
}
.login_form {
  background: var(--ix-bg, #0a0c10) url(../../assets/images/login_bg.png) no-repeat center center;
  height: 760px;
  position: relative;
  overflow: hidden;
.login_right {
    padding: 20px 30px;
    position: absolute;
    background: var(--ix-surface, #12151c);
    width: 350px;
    /* Fixed height replaced for the same reason as Login.vue: the inline error
       and the referral socket note both change how tall this card is. */
    min-height: 485px;
    left: 50%;
    top: 50%;
    margin-left: -175px;
    transform: translateY(-50%);
    border-top: 4px solid var(--ix-orange, #00c2a8);
    border-radius: 5px;
.tel-title{
      color: #fff;
    }
    form.ivu-form.ivu-form-label-right.ivu-form-inline {
.ivu-form-item {
.ivu-form-item-content {
.register_btn.ivu-btn {
            width: 100%;
            background-color: var(--ix-orange, #ff6b00);
            outline: none;
            border-color: var(--ix-orange, #ff6b00);
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
            border: 1px solid var(--ix-orange, #ff6b00);
            background: transparent;
            top: -10px;
            outline: none;
            right: 0;
            width: 30%;
            color: var(--ix-orange, #ff6b00);
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
          color: var(--ix-orange, #ff6b00);
          margin-left: -10px;
        }
.ivu-checkbox-wrapper.ivu-checkbox-wrapper-checked {
.ivu-checkbox.ivu-checkbox-checked {
.ivu-checkbox-inner {
              border: 1px solid var(--ix-orange, #ff6b00);
              background-color: var(--ix-orange, #ff6b00);
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
/**
 * REGISTER — against svc-identity's `auth.register`.
 *
 * The contract is `{ handle, email, password, region? }` and this form now asks
 * for exactly that. What the vendor asked for instead, and why none of it
 * survived:
 *
 * - **A mainland-China mobile number and an SMS code.** `/uc/register/phone`
 *   and `/uc/mobile/code` on the dead Java backend, gated behind a
 *   third-party captcha widget loaded from a CDN. svc-identity has no phone
 *   registration and no SMS sender; there is nothing to point them at. Keeping
 *   the fields and posting them nowhere would have been the hang this work
 *   exists to remove.
 * - **A referral / promotion code.** `auth.register` has no such field, and
 *   svc-identity stores no referral graph. A field that silently discards what
 *   the user typed is worse than no field, so it is stated as missing instead
 *   (`uc.regist.referralSocket`) rather than collected and dropped.
 * - **`superPartner`, `ticket`, `randStr`.** Java-side captcha and partner-tier
 *   parameters with no counterpart here.
 *
 * PASSWORD LENGTH. The contract's floor is 12 characters, not the vendor's 6.
 * Validating locally at 12 means the user is told before the round trip rather
 * than being handed a zod error afterwards — but the server is still the one
 * that decides.
 *
 * On success svc-identity returns a session, exactly as `auth.login` does.
 * The user is signed in on the spot rather than bounced to /login to type the
 * same credentials again.
 */
import { mutate, subjectOf } from "../../config/intafaced.js";

/** Mirrors the contract's own handle rule, so the message can be specific. */
const HANDLE_RE = /^[a-zA-Z0-9_]{3,32}$/;
/** Deliberately permissive: svc-identity's zod `.email()` is the real check. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** The contract's minimum. Kept as a constant so the copy cannot drift from it. */
const PASSWORD_MIN = 12;

export default {
  data() {
    const validateHandle = (rule, value, callback) => {
      if (!value) return callback(new Error(this.$t("uc.regist.handletip")));
      if (!HANDLE_RE.test(value)) return callback(new Error(this.$t("uc.regist.handleerr")));
      callback();
    };
    const validateEmail = (rule, value, callback) => {
      if (!value) return callback(new Error(this.$t("uc.regist.emailtip")));
      if (!EMAIL_RE.test(value)) return callback(new Error(this.$t("uc.regist.emailerr")));
      callback();
    };
    const validateRegion = (rule, value, callback) => {
      // Optional in the contract. Empty is fine; two letters is fine; anything
      // else would be rejected server-side, so say so here.
      if (!value) return callback();
      if (!/^[A-Za-z]{2}$/.test(value)) return callback(new Error(this.$t("uc.regist.regionerr")));
      callback();
    };
    const validateRepassword = (rule, value, callback) => {
      if (value === "") {
        callback(new Error(this.$t("uc.regist.confirmpwdtip")));
      } else if (value !== this.formInline.password) {
        callback(new Error(this.$t("uc.regist.confirmpwderr")));
      } else {
        callback();
      }
    };
    return {
      registing: false,
      registerError: "",
      agree: true,
      allowRegister: true,
      formInline: {
        handle: "",
        email: "",
        password: "",
        repassword: "",
        region: ""
      },
      ruleInline: {
        handle: [{ validator: validateHandle, trigger: "blur" }],
        email: [{ validator: validateEmail, trigger: "blur" }],
        password: [
          {
            required: true,
            message: this.$t("uc.regist.pwdtip"),
            trigger: "blur"
          },
          {
            type: "string",
            min: PASSWORD_MIN,
            message: this.$t("uc.regist.pwdmsg"),
            trigger: "blur"
          }
        ],
        repassword: [{ validator: validateRepassword, trigger: "blur" }],
        region: [{ validator: validateRegion, trigger: "blur" }]
      }
    };
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
    this.init();
  },
  methods: {
    init() {
      this.$store.commit("navigate", "nav-other");
      this.$store.state.HeaderActiveName = "0";
      if (this.isLogin) {
        this.$router.push("/");
      }
    },
    handleSubmit(name) {
      var self = this;
      this.$refs[name].validate(function(valid) {
        if (!valid) return;
        if (!self.agree) {
          self.registerError = self.$t("uc.regist.agreementtip");
          return;
        }

        self.registing = true;
        self.registerError = "";

        var input = {
          handle: self.formInline.handle,
          email: self.formInline.email,
          password: self.formInline.password
        };
        if (self.formInline.region) input.region = self.formInline.region.toUpperCase();

        mutate("identity", "auth.register", input).then(function(res) {
          self.registing = false;

          if (!res.ok) {
            // Includes the case where registration is closed on this deployment
            // ("Registration is not open yet"), which is a real answer from the
            // service and not something to translate into a generic failure.
            self.registerError = res.message;
            return;
          }

          // `auth.register` returns a session. Use it — do not send the user to
          // /login to retype what they just typed.
          self.$store.commit("setIxSession", res.data);
          self.$store.commit("setMember", {
            id: res.data.userId || subjectOf(res.data.accessToken),
            username: self.formInline.handle
          });
          self.formInline.password = "";
          self.formInline.repassword = "";
          self.$Notice.success({
            title: self.$t("common.tip"),
            desc: self.$t("uc.regist.success")
          });
          self.$router.push("/uc/safe");
        });
      });
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
              border: 1px solid var(--ix-orange, #ff6b00);
              background-color: var(--ix-orange, #ff6b00);
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
    background-color: var(--ix-surface, #12151c);
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
