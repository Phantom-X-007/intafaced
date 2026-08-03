<template>
  <div class="nav-rights safe-page">
    <div class="ix-page-head">
      <h1>{{ $t('uc.safe.title') }}</h1>
      <p>{{ $t('uc.safe.lead') }}</p>
      <div class="ix-source">svc-identity · /api/identity/trpc</div>
    </div>

    <!-- ── two-factor ───────────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('uc.safe.totpTitle') }}</h2>
        <span class="ix-sub">totp.enrol · totp.confirm</span>
      </div>
      <p class="ix-lead">{{ $t('uc.safe.totpLead') }}</p>

      <div v-if="!enrolment">
        <p v-if="totpError" class="ix-empty ix-empty-error" role="alert">{{ totpError }}</p>
        <Button type="primary" :loading="enrolling" @click="startTotp">{{ $t('uc.safe.totpStart') }}</Button>
      </div>

      <div v-else class="enrol-box">
        <p class="ix-warn" role="alert">{{ $t('uc.safe.totpSecretWarning') }}</p>

        <div class="kv">
          <span class="k">{{ $t('uc.safe.totpSecret') }}</span>
          <code class="v">{{ enrolment.secret }}</code>
        </div>
        <div class="kv">
          <span class="k">{{ $t('uc.safe.totpUri') }}</span>
          <code class="v uri">{{ enrolment.uri }}</code>
        </div>
        <div class="kv">
          <span class="k">{{ $t('uc.safe.totpRecovery') }}</span>
          <span class="v">
            <code v-for="c in enrolment.recoveryCodes" :key="c" class="rc">{{ c }}</code>
          </span>
        </div>

        <Form :label-width="140" style="margin-top:16px;">
          <FormItem :label="$t('uc.safe.totpCode')">
            <Input v-model="totpCode" style="width:180px" maxlength="6" placeholder="000000" />
          </FormItem>
          <p v-if="totpError" class="ix-empty ix-empty-error" role="alert">{{ totpError }}</p>
          <p v-if="totpDone" class="ix-ok" role="status">{{ $t('uc.safe.totpDone') }}</p>
          <FormItem>
            <Button type="primary" :loading="confirming" @click="confirmTotp">{{ $t('uc.safe.totpConfirm') }}</Button>
          </FormItem>
        </Form>
      </div>
    </div>

    <!-- ── security keys ────────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('uc.safe.keysTitle') }}</h2>
        <span class="ix-sub">webauthn.list</span>
      </div>
      <p class="ix-lead">{{ $t('uc.safe.keysLead') }}</p>

      <IxState
        :loading="keys.loading"
        :reason="keys.reason"
        :message="keys.message"
        endpoint="/api/identity/trpc/webauthn.list"
      >
        <div v-if="keys.data && keys.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('uc.safe.keyId') }}</th>
                <th>{{ $t('uc.safe.keyAdded') }}</th>
                <th>{{ $t('uc.safe.keyTransports') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="k in keys.data" :key="k.credentialId">
                <td><code>{{ shortId(k.credentialId) }}</code></td>
                <td>{{ k.createdAt | dateFormat }}</td>
                <td>{{ (k.transports && k.transports.length) ? k.transports.join(', ') : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('uc.safe.noKeys') }}</div>
        <p class="ix-cap-note">{{ $t('uc.safe.keysEnrolSocket') }}</p>
      </IxState>
    </div>

    <!-- ── sessions ─────────────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('uc.safe.sessionsTitle') }}</h2>
        <span class="ix-sub">auth.logoutAll</span>
      </div>
      <p class="ix-lead">{{ $t('uc.safe.sessionsLead') }}</p>
      <p v-if="revokedCount !== null" class="ix-ok" role="status">
        {{ $t('uc.safe.sessionsRevoked', { n: revokedCount }) }}
      </p>
      <p v-if="sessionError" class="ix-empty ix-empty-error" role="alert">{{ sessionError }}</p>
      <Button :loading="revoking" @click="logoutEverywhere">{{ $t('uc.safe.sessionsRevokeBtn') }}</Button>
    </div>

    <!-- ── verification, by reference ───────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('uc.safe.kycTitle') }}</h2>
        <span class="ix-sub">kyc.status</span>
      </div>
      <IxState
        :loading="kyc.loading"
        :reason="kyc.reason"
        :message="kyc.message"
        endpoint="/api/identity/trpc/kyc.status"
      >
        <div v-if="kyc.data" class="kv">
          <span class="k">{{ $t('uc.identity.tier') }}</span>
          <span class="v">{{ $t('uc.identity.tiers.' + kyc.data.tier) }}</span>
        </div>
        <router-link to="/identbusiness">
          <Button size="small" style="margin-top:10px;">{{ $t('uc.safe.kycManage') }}</Button>
        </router-link>
      </IxState>
    </div>

    <!-- ── what this screen used to offer and cannot ────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('uc.safe.missingTitle') }}</h2>
        <span class="ix-sub">no service</span>
      </div>
      <IxState reason="no_surface" :message="$t('uc.safe.missingBody')" />
    </div>
  </div>
</template>

<style scoped lang="scss">
button.ivu-btn{
  &:focus{
    box-shadow: 0 0 0 2px rgba(45,140,240,0);
  }
}
button.ivu-btn.ivu-btn-primary{
  box-shadow: 0 0 0 2px rgba(45,140,240,0);
}
.nav-right {
  padding-left: 15px;
.user.user-top-icon {
    height: 80px;
    border-bottom: 1px dashed #141414;
    position: relative;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    padding: 0 50px;
  }
}
.uploadimgtip {
  position: relative;
  top: -20px;
  color: #00c2a8;
}
.account-box.account-in.account-item.account-detail {
  padding: 30px 0;
  // background: white;
  margin: 6px 0;
}

.account-box.account-in.account-item.account-detail.detail-list {
  width: 40%;
  margin: 0 auto;
}

.account-box
.account-in
.account-item
.account-detail
.detail-list
.input-control {
  margin-bottom: 10px;
  height: 45px;
}

.detail-list.input-control.ivu-input-group-prepend {
  width: 63px;
}

.detail-list.input-control.ivu-input {
  height: 45px;
}

.account-box.account-in.account-item {
  margin-bottom: 10px;
}

.account-box.account-in.account-item.account-item-in {
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-align: center;
  -ms-flex-align: center;
  align-items: center;
  padding: 15px 30px 15px 50px;
  // background-color: white;
  -webkit-box-shadow: 0 1px 0 0 rgba(69, 112, 128, 0.06);
  box-shadow: 0 1px 0 0 rgba(69, 112, 128, 0.06);
  font-size: 14px;
  color: #fff;
}

.account-box.account-in.account-item.account-item-in.icons {
  height: 17px;
  width: 17px;
  display: inline-block;
  margin-top: -1px;
  background-size: 100% 100%;
}

.account-box.account-in.account-item.account-item-in.yesImg {
  background-image: url(../../assets/img/overicon.png);
}

.icons.noImg {
  background-image: url(../../assets/img/noicon.png);
}

.account-box.account-in.account-item.account-item-in.card-number {
  width: 142px;
  height: 40px;
  margin-right: 15px;
  border-right: 1px dashed #141414;
  padding: 0 15px;
  line-height: 40px;
  text-align: left;
  display: inline-block;
}

.account-box.account-in.account-item.account-item-in.bankInfo {
  width: 70%;
  text-align: left;
}

.account-box.account-in.account-item.account-item-in.btn {
  padding: 8px 10px;
  cursor: pointer;
}

.tips-g {
  color: #909090;
  font-size: 12px;
}

.gr {
  color: #b4b4b4;
}

.m1 {
  display: inline-block;
  width: 25px;
  height: 25px;
  background: url(../../assets/img/m1.png);
  background-size: 100% 100%;
  vertical-align: middle;
  margin-right: 5px;
}

.m2 {
  display: inline-block;
  width: 25px;
  height: 25px;
  background: url(../../assets/img/m2.png);
  background-size: 100% 100%;
  vertical-align: middle;
  margin-right: 5px;
}

.m3 {
  display: inline-block;
  width: 25px;
  height: 25px;
  background: url(../../assets/img/m3.png);
  background-size: 100% 100%;
  vertical-align: middle;
  margin-right: 5px;
}

.itp {
  display: inline-block;
}

.user-right {
  width: 80%;
}

.rightarea {
  padding-left: 15px!important;
  padding-right: 15px!important;
  margin-bottom: 60px!important;
}

.rightarea.rightarea-top {
  line-height: 75px;
  border-bottom: #f1f1f1 solid 1px;
}

.rightarea.trade-process {
  line-height: 30px;
  padding: 0 15px;
  background: #f1f1f1;
  display: inline-block;
  position: relative;
  margin-right: 20px;
}

.rightarea.trade-process.active {
  color: #eb6f6c;
  background: #1a1004;
}

.rightarea.trade-process.icon {
  background: #fff;
  border-radius: 20px;
  height: 20px;
  width: 20px;
  display: inline-block;
  line-height: 20px;
  text-align: center;
  margin-right: 10px;
}

.rightarea.trade-process.arrow {
  position: absolute;
  top: 10px;
  right: -5px;
  width: 0;
  height: 0;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 5px solid #f1f1f1;
}

.rightarea.trade-process.active.arrow {
  border-left: 5px solid #1a1004;
}

.rightarea.rightarea-tabs {
  border: none;
}

.rightarea.rightarea-tabs li > a {
  width: 100%;
  height: 100%;
  padding: 0;
  margin-right: 0;
  font-size: 14px;
  color: #646464;
  border-radius: 0;
  border: none;
  display: flex;
  justify-content: center;
  align-items: center;
}

.rightarea.rightarea-tabs li > a:hover {
  background-color: #fcfbfb;
}

.rightarea.rightarea-tabs li {
  width: 125px;
  height: 40px;
  position: relative;
  margin: -1px 0 0 -1px;
  border: 1px solid #f1f1f1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.rightarea.rightarea-tabs li.active {
  background-color: #fcfbfb;
}

.rightarea.rightarea-tabs li:last-child {
  border-right: 1px solid #f1f1f1;
}

.rightarea.rightarea-tabs li.active > a,
.rightarea.rightarea-tabs li:hover > a {
  color: #da2e22;
  border: none;
}

.rightarea.panel-tips {
  border: 3px solid #1a1004;
  color: #9e9e9e;
  font-size: 12px;
}

.rightarea.panel-tips.panel-header {
  background: #1a1004;
  line-height: 40px;
  margin-bottom: 15px;
}

.rightarea.panel-tips.panel-title {
  font-size: 16px;
}

.rightarea.recordtitle {
  cursor: pointer;
}

.user.top-icon {
  /* background: url("../../images/user/userplist.png") no-repeat 0 0; */
  width: 75px;
  height: 75px;
  display: inline-block;
}

.user.top-icon.intro {
  background-position: 0 -670px;
}

.user.user-info {
  padding: 0px 10px;
  background-color: #fff;
  color: #fff;
}

.user.user-info.user-info-top {
  border-bottom: 1px dashed #141414;
  padding-bottom: 20px;
}

.user.user-info h5 {
  font-size: 18px;
}

.user.user-info h5.iconfont {
  font-size: 20px;
  color: #e24a64;
  margin-left: 10px;
}

.user-avatar {
  display: flex;
  justify-content: space-between;
}

.user-icons {
  display: flex;
  align-self: center;
  width: 300px;
}

.user-icons.icons-in {
  height: 45px;
  width: 45px;
  border-radius: 50%;
  background-color: #00c2a8;
  display: flex;
  justify-content: center;
  align-items: center;
  align-self: center;
}

.user-icons.icons-in em {
  color: white;
  font-size: 20px;
  font-style: normal;
}

.user-icons.user-name {
  margin-left: 10px;
  display: flex;
  justify-content: flex-start;
  /* align-items: center; */
  flex-direction: column;
}

.user-icons.user-name span {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  width: 225px;
  height: 52px;
  overflow: hidden;
  font-size: 14px;
  white-space: nowrap;
  text-overflow: ellipsis;
  -o-text-overflow: ellipsis;
}

.user-top-icon.trade-info {
  width: 420px;
  padding-left: 30px;
  display: flex;
}

.user-top-icon.trade-info.item {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.user-top-icon.trade-info.item.capital {
  width: 60%;
}

.user-icons.user-name span.uid {
  color: #909090;
  font-size: 12px;
}

.circle-info {
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  height: 80px;
  width: 80px;
  border-radius: 50%;
  border: 2px solid #ebeff5;
  margin-left: 14px;
}

.circle-info span {
  font-weight: bolder;
}

.circle-info p {
  color: #909090;
  margin: 0;
  padding: 0;
}

.circle-info p.count {
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}

.user-avatar-public {
  background: #df9a00;
  border-radius: 50%;
  height: 52px;
  width: 52px;
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: 0 1px 5px 0 rgba(71, 78, 114, 0.24);
  position: relative;
}

.user-avatar-public >.user-avatar-in {
  background: #00c2a8;
  border-radius: 50%;
  height: 42px;
  width: 42px;
  display: flex;
  justify-content: center;
  align-items: center;
  color: white;
}
/* additions */
.router-link-active {
  color: red;
}
/* router-link-exact-active router-link-active */
.account-item-in i {
  color: #00c2a8!important;
}
.btn {
  color: #00c2a8;
}
.ivu-btn-primary {
  background-color: #00c2a8;
  border-color: #00c2a8;
}
</style>
<style lang="scss">
li.ivu-upload-list-file.ivu-upload-list-file-finish {
  &:hover {
    span {
      color: #00c2a8;
    }
  }
}

.idcard-title{
    font-size: 13px;
    margin-bottom: 10px;
}
.acc_sc{
    margin-top: 10px;
}
.idcard-desc{
    padding: 10px 150px 50px 150px;
    >p{
        font-size: 13px;
        margin-bottom: 10px;
        text-align:left;
        color: #8a8a8a;
    }
}

@media screen and (max-width:768px){
.safe.nav-right.user.user-top-icon{
        padding: 0 0!important;
    }
.safe.account-box.account-in.account-item.account-item-in{
        padding: 15px 0px 15px 0px;
    }
.safe.account-box.account-in.account-item.account-item-in.bankInfo {
        width: 50%!important;
    }
.safe.account-box.account-in.account-item.account-item-in.card-number{
        width: 100px!important;
    }
.safe.user-icons.user-name span{
        width: 100px!important;
    }
}
</style>

<style scoped lang="scss">
/* B3 — Security page shares money/desk shell recipe. */
.ix-money.ix-safe {
  margin: 0 0 16px;
  padding: 12px 14px 18px;
  border: 1px solid var(--ix-border, rgba(255, 255, 255, 0.08));
  border-radius: 10px;
  background: var(--ix-surface, rgba(255, 255, 255, 0.03));
}
.ix-safe-state {
  padding: 4px 0 10px;
}
.ix-dualbook {
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid rgba(0, 194, 168, 0.35);
  border-radius: 6px;
  background: rgba(0, 194, 168, 0.06);
  color: #c8cdd4;
  font-size: 12.5px;
  line-height: 1.5;
}
.ix-dualbook strong {
  color: #00c2a8;
  font-weight: 600;
}
</style>

<style scoped>
.safe-page {
  padding: 0 0 40px 20px;
}
.ix-lead {
  color: var(--ix-text-dim, #8a909c);
  font-size: 13.5px;
  line-height: 1.6;
  margin: 0 0 16px;
}
.kv {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.kv .k {
  min-width: 150px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ix-text-faint, #6b7280);
}
.kv .v {
  color: var(--ix-text, #e8ebf0);
  font-size: 15px;
  word-break: break-all;
}
.kv .v.uri {
  font-size: 12px;
}
.rc {
  display: inline-block;
  margin: 0 6px 6px 0;
  padding: 2px 6px;
  border: 1px solid var(--ix-hairline, rgba(255, 255, 255, 0.09));
  border-radius: 4px;
  font-size: 13px;
}
.ix-warn {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-left: 3px solid var(--ix-orange, #ff8a1f);
  background: rgba(255, 138, 31, 0.07);
  color: var(--ix-text, #e8ebf0);
  font-size: 13px;
  line-height: 1.5;
}
.ix-ok {
  color: var(--ix-up, #00b275);
  font-size: 13px;
  margin: 0 0 12px;
}
.ix-cap-note {
  margin: 12px 0 0;
  padding-left: 10px;
  border-left: 2px solid var(--ix-orange, #ff8a1f);
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--ix-text-faint, #6b7280);
}
.enrol-box {
  padding: 14px;
  border: 1px solid var(--ix-hairline, rgba(255, 255, 255, 0.09));
  border-radius: 8px;
}
</style>

<script>
/**
 * SECURITY SETTINGS — svc-identity, and an honest list of what it cannot do.
 *
 * This is the landing page after sign-in, so what it claims matters more than
 * most screens. The vendor version drove thirteen Java endpoints: bind email,
 * bind phone, four SMS/email code senders, change login password, set and change
 * and reset a transaction password, real-name approval, and a document upload.
 * Of those thirteen, svc-identity implements NONE. Left alone, this page would
 * have offered a signed-in user eleven buttons that hang.
 *
 * What svc-identity does implement, and what this page therefore does:
 *
 * - `totp.enrol` / `totp.confirm` — genuine two-factor enrolment, two steps.
 * - `webauthn.list` — security keys already registered.
 * - `auth.logoutAll` — revoke every refresh token for this user.
 * - `kyc.status` — the verification tier, read-only here, managed on
 *   /identbusiness.
 *
 * THE SECRET IS SHOWN, THE QR CODE IS NOT. `totp.enrol` returns `secret`, `uri`
 * and `recoveryCodes`. Rendering the `uri` as a scannable QR would need a
 * generator, and the two QR libraries this shell already carries would each pull
 * a rendering path into a security surface for cosmetic benefit. The secret and
 * the URI are both shown as text, which every authenticator accepts.
 *
 * RECOVERY CODES ARE SHOWN ONCE, and the page says so. They come back from
 * `enrol` and are not retrievable afterwards — a user who navigates away without
 * copying them has lost them. That warning is the most load-bearing sentence on
 * this screen.
 *
 * WEBAUTHN ENROLMENT IS NOT WIRED. `registerOptions` / `registerVerify` exist on
 * the service, but driving them needs `navigator.credentials.create()` and a
 * correct base64url encoding of the attestation response. Half-implementing a
 * credential registration is worse than not offering it — a key that appears to
 * register and does not is a lockout waiting to happen — so the list is shown
 * and the enrol button is stated as missing rather than mocked.
 */
import IxState from "../intafaced/IxState.vue";
import ixModule from "../intafaced/module-mixin.js";
import { query, mutate } from "../../config/intafaced.js";

export default {
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      keys: this.emptySection(),
      kyc: this.emptySection(),
      enrolment: null,
      enrolling: false,
      confirming: false,
      totpCode: "",
      totpError: "",
      totpDone: false,
      revoking: false,
      revokedCount: null,
      sessionError: ""
    };
  },
  methods: {
    shortId(id) {
      var s = String(id || "");
      return s.length <= 16 ? s : s.slice(0, 16) + "…";
    },
    startTotp() {
      var self = this;
      this.totpError = "";
      this.enrolling = true;
      mutate("identity", "totp.enrol", {}, this.ixToken).then(function (res) {
        self.enrolling = false;
        if (!res.ok) {
          // CONFLICT here means already enrolled, which is a different sentence
          // from a failure and svc-identity words it that way.
          self.totpError = res.message;
          return;
        }
        self.enrolment = res.data;
      });
    },
    confirmTotp() {
      var self = this;
      this.totpError = "";
      if (!/^\d{6}$/.test(this.totpCode)) {
        this.totpError = this.$t("uc.safe.totpCodeFormat");
        return;
      }
      this.confirming = true;
      mutate(
        "identity",
        "totp.confirm",
        { secret: this.enrolment.secret, code: this.totpCode },
        this.ixToken
      ).then(function (res) {
        self.confirming = false;
        if (!res.ok) {
          self.totpError = res.message;
          return;
        }
        self.totpDone = true;
        self.totpCode = "";
      });
    },
    logoutEverywhere() {
      var self = this;
      this.sessionError = "";
      this.revokedCount = null;
      this.revoking = true;
      mutate("identity", "auth.logoutAll", {}, this.ixToken).then(function (res) {
        self.revoking = false;
        if (!res.ok) {
          self.sessionError = res.message;
          return;
        }
        self.revokedCount = res.data.revoked;
        // This session's own refresh token is among those revoked, so the
        // honest thing is to end it here too rather than leave an access token
        // alive on a page that just said every session was signed out.
        self.$store.commit("clearIxSession");
        setTimeout(function () {
          self.$router.push("/login");
        }, 1500);
      });
    }
  },
  created() {
    this.$store.commit("navigate", "nav-other");
    this.load("keys", query("identity", "webauthn.list", undefined, this.ixToken));
    this.load("kyc", query("identity", "kyc.status", undefined, this.ixToken));
  }
};
</script>
