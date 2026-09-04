<template>
  <div class="login_form">
    <div class="login_right">
      <Form ref="formInline" :model="formInline" :rules="ruleInline" inline aria-label="Log in">
        <div class="login_title">{{$t('uc.login.login')}}</div>
        <p class="ix-login-honest" role="note">
          {{ $t('uc.login.identityNote') }}
        </p>
        <FormItem prop="user">
          <Input name="user" type="text" v-model="formInline.user" :placeholder="$t('uc.login.usertip')" class="user" autocomplete="username">
          </Input>
        </FormItem>
        <FormItem prop="password" class="password">
          <Input type="password" v-model="formInline.password" :placeholder="$t('uc.login.pwdtip')" @on-keyup="onKeyup" autocomplete="current-password">
          </Input>
        </FormItem>
        <FormItem v-if="totpRequired" prop="totp" class="totp">
          <Input type="text" v-model="formInline.totp" :placeholder="$t('uc.login.totptip')" autocomplete="one-time-code" @on-keyup="onKeyup">
          </Input>
        </FormItem>
        <p v-if="signInError" class="ix-login-error" role="alert" aria-live="polite">{{ signInError }}</p>
        <p style="height:30px;">
          <router-link to="/findPwd" style="color:#979797;float:right;padding-right:10px;font-size:12px;">
            {{$t('uc.login.forget')}}
          </router-link>
        </p>
        <FormItem style="margin-bottom:15px;">
          <Button class="login_btn" :loading="signingIn" :disabled="signingPasskey" @click="handleSubmit('formInline')">{{$t('uc.login.login')}}</Button>
        </FormItem>
        <FormItem style="margin-bottom:15px;">
          <Button class="passkey_btn" :loading="signingPasskey" :disabled="signingIn" @click="handlePasskey">{{$t('uc.login.passkey')}}</Button>
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
  background: #000;
  min-height: calc(100vh - 48px);
  position: relative;
  overflow: hidden;
.login_right {
    box-sizing: border-box;
    padding: 28px 30px 24px;
    position: absolute;
    background: var(--ix-surface, #12151c);
    width: 350px;
    /* Was a fixed 330px with a -165px top margin to centre it. The second-factor
       field and the inline error both make this card taller, and a fixed height
       would have clipped whichever rendered last. `transform` centres a box of
       unknown height without needing to know it. */
    min-height: 330px;
    left: 50%;
    top: 50%;
    margin-left: -175px;
    transform: translateY(-50%);
    border: 1px solid #202020;
    border-radius: 0;
    form.ivu-form.ivu-form-label-right.ivu-form-inline {
.login_title{
        height: auto;
        margin-bottom: 8px;
        color: var(--ix-text, #e8ebf0);
        font-size: 22px;
        font-weight: 500;
        line-height: 1.3;
      }
.ivu-form-item {
.ivu-form-item-content {
.login_btn.ivu-btn {
            width: 100%;
            background-color: var(--ix-orange, #c8c8c8);
            outline: none;
            border-color: var(--ix-orange, #c8c8c8);
            color: var(--ix-on-accent, #000000);
            font-size: 18px;
            border-radius: 0;
            &:focus-visible {
              outline: 2px solid var(--ix-orange-light, #e2e2e2);
              outline-offset: 2px;
            }
          }
.passkey_btn.ivu-btn {
            width: 100%;
            background-color: transparent;
            outline: none;
            border-color: var(--ix-orange, #c8c8c8);
            color: var(--ix-orange, #c8c8c8);
            font-size: 16px;
            border-radius: 0;
            &:focus-visible {
              outline: 2px solid var(--ix-orange-light, #e2e2e2);
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
      color: var(--ix-orange, #c8c8c8);
    }
  }
}
/* The captcha widget's styles (#captcha, #wait, #notice, .geetest_*) went with
   the widget — it was loaded from a third-party CDN and gated on the dead
   backend. Nothing renders those ids any more. */
.user.ivu-btn,
.ivu-btn:active,
.ivu-btn:focus {
  border-color: #d7dde4;
  box-shadow: none;
}
/* */

.login_right {
  background: #000 !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: 1px solid var(--ix-hairline, rgba(255,255,255,0.09));
  border-radius: 0;
  box-shadow: none;
}
.ix-login-honest {
  margin: 0 0 22px;
  padding: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--ix-text-dim, #8a909c);
  border: 0;
  background: transparent;
}
@media screen and (max-width: 640px) {
  .login_form { min-height: calc(100vh - 48px); overflow: visible; }
  .login_form .login_right {
    position: relative;
    top: auto;
    left: auto;
    width: calc(100% - 24px);
    min-height: 0;
    margin: 28px 12px;
    padding: 24px 20px 22px;
    transform: none;
  }
  .login_form .login_right ::v-deep .ivu-form-item,
  .login_form .login_right ::v-deep .ivu-form-item-content { width: 100%; }
  .login_form .login_right ::v-deep .ivu-input { min-width: 0; }
}
.ix-login-error {
  margin: 0 0 10px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.4;
  color: #ffb4a2;
  border-left: 2px solid #e5484d;
  background: rgba(229, 72, 77, 0.08);
}
</style>
<script>
/**
 * SIGN IN — against svc-identity, and against nothing else.
 *
 * WHAT THIS REPLACED, AND WHY IT HAD TO GO.
 * This form used to POST `/uc/login` to the Java ucenter and store whatever
 * came back as the signed-in user. That is the wrong book. svc-identity owns
 * accounts, sessions, scopes and the KYC tier the jurisdiction matrix reads;
 * the Java `member` table owns none of it and is not running. Authenticating
 * there would have produced a session the rest of the platform does not
 * recognise — every scoped procedure would answer UNAUTHORIZED to a user the
 * shell was showing as signed in.
 *
 * Three vendor behaviours were removed rather than ported:
 *
 * 1. The Geetest captcha. It fetched `/uc/start/captcha` from the dead backend
 *    and gated the submit button on the callback, so with nothing listening the
 *    button did nothing at all — a hang, not an error. svc-identity applies its
 *    own throttling; the browser is not where that is enforced.
 * 2. The +86 country-code selector and the `/^1[3-9]\d{9}$/` guard, which
 *    accepted mainland-China mobile numbers and refused every other identifier
 *    on earth. `auth.login` takes an `identifier` — handle or email.
 * 3. Writing the member to localStorage. The session lives in memory only
 *    (config/store.js), and the member is now a projection of it.
 *
 * `totpCode` is optional in the contract: svc-identity answers UNAUTHORIZED
 * with "Two-factor code required" when the account is enrolled and the field
 * was blank, and that message is shown verbatim rather than being guessed at
 * in advance.
 *
 * Passkey sign-in uses the existing public doors: webauthn.authOptions then
 * navigator.credentials.get then webauthn.authVerify. The session commit is
 * the same as auth.login. A disabled service, a cancelled prompt, or a missing
 * authenticator is shown as a named refuse — never a fake session.
 */
import { mutate, subjectOf } from "../../config/intafaced.js";

function b64urlToBytes(s) {
  var b64 = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  var bin = atob(b64);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(buf) {
  var bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  var bin = "";
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function assertionFromCredential(cred) {
  var response = cred.response || {};
  var body = {
    id: cred.id,
    rawId: bytesToB64url(cred.rawId),
    type: "public-key",
    response: {
      clientDataJSON: bytesToB64url(response.clientDataJSON),
      authenticatorData: bytesToB64url(response.authenticatorData),
      signature: bytesToB64url(response.signature)
    }
  };
  if (response.userHandle) {
    body.response.userHandle = bytesToB64url(response.userHandle);
  }
  if (typeof cred.getClientExtensionResults === "function") {
    body.clientExtensionResults = cred.getClientExtensionResults();
  }
  return body;
}

export default {
  data() {
    return {
      signingIn: false,
      signingPasskey: false,
      signInError: "",
      totpRequired: false,
      formInline: {
        user: "",
        password: "",
        totp: ""
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
        this.$router.push("/exchange");
      }
    },
    onKeyup(ev) {
      if (ev.keyCode == 13) {
        this.handleSubmit("formInline");
      }
    },
    commitSession(data) {
      this.$store.commit("setIxSession", data);
      // The member is a projection of the session, not a second record.
      // Only what the shell's chrome actually renders, and `username` is the
      // identifier the user typed — svc-identity does not return a display
      // name, and inventing one here would be inventing content.
      this.$store.commit("setMember", {
        id: data.userId || subjectOf(data.accessToken),
        username: this.formInline.user
      });
      this.formInline.password = "";
      this.formInline.totp = "";
      this.$Message.success(this.$t("uc.login.success"));
      this.$router.push("/exchange");
    },
    handleSubmit(name) {
      var self = this;
      if (this.signingIn || this.signingPasskey) return;
      this.$refs[name].validate(function(valid) {
        if (!valid) return;

        self.signingIn = true;
        self.signInError = "";

        var input = {
          identifier: self.formInline.user,
          password: self.formInline.password
        };
        // Send the field only when the user filled it. An empty string is not
        // "no code" to the contract — it is a code that cannot be valid.
        if (self.formInline.totp) input.totpCode = self.formInline.totp;

        mutate("identity", "auth.login", input).then(function(res) {
          self.signingIn = false;

          if (!res.ok) {
            // Verbatim. svc-identity deliberately returns the same wording for a
            // wrong password and a wrong second factor, and softening either into
            // a guess would undo that.
            self.signInError = res.message;
            if (/two-factor code required/i.test(String(res.message || ""))) {
              self.totpRequired = true;
              self.$nextTick(function() {
                var input = self.$el.querySelector('.totp input');
                if (input) input.focus();
              });
            }
            return;
          }

          self.commitSession(res.data);
        });
      });
    },
    handlePasskey() {
      var self = this;
      var identifier = (this.formInline.user || "").trim();
      if (this.signingIn || this.signingPasskey) return;
      if (!identifier) {
        this.signInError = this.$t("uc.login.passkeyNeedIdentifier");
        return;
      }
      if (
        typeof window === "undefined" ||
        !window.PublicKeyCredential ||
        !navigator.credentials ||
        typeof navigator.credentials.get !== "function"
      ) {
        this.signInError = this.$t("uc.login.webauthnUnavailable");
        return;
      }

      this.signingPasskey = true;
      this.signInError = "";

      mutate("identity", "webauthn.authOptions", { identifier: identifier }).then(function(res) {
        if (!res.ok) {
          self.signingPasskey = false;
          self.signInError = res.message;
          return;
        }

        var opts = res.data || {};
        var allow = (opts.allowCredentials || []).map(function(c) {
          var item = { type: "public-key", id: b64urlToBytes(c.id) };
          if (c.transports && c.transports.length) item.transports = c.transports;
          return item;
        });
        var publicKey = {
          challenge: b64urlToBytes(opts.challenge),
          timeout: opts.timeout,
          rpId: opts.rpId,
          userVerification: opts.userVerification || "required",
          allowCredentials: allow
        };

        return Promise.resolve()
          .then(function() {
            return navigator.credentials.get({ publicKey: publicKey });
          })
          .then(function(cred) {
            if (!cred) {
              self.signingPasskey = false;
              self.signInError = self.$t("uc.login.webauthnUnavailable");
              return;
            }
            return mutate("identity", "webauthn.authVerify", {
              identifier: identifier,
              credential: assertionFromCredential(cred)
            }).then(function(verifyRes) {
              self.signingPasskey = false;
              if (!verifyRes.ok) {
                self.signInError = verifyRes.message;
                return;
              }
              self.commitSession(verifyRes.data);
            });
          }, function(err) {
            self.signingPasskey = false;
            if (err && err.name === "NotAllowedError") {
              self.signInError = self.$t("uc.login.webauthnCancelled");
              return;
            }
            self.signInError =
              (err && err.message) || self.$t("uc.login.webauthnUnavailable");
          });
      }).then(null, function(err) {
        self.signingPasskey = false;
        if (!self.signInError) {
          self.signInError =
            (err && err.message) || self.$t("uc.login.webauthnUnavailable");
        }
      });
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
