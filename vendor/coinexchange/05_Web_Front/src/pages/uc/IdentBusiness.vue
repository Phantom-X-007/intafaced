<template>
  <div class="ix-page ident-page">
    <div class="ix-page-head">
      <h1>{{ $t('uc.identity.title') }}</h1>
      <p>{{ $t('uc.identity.lead') }}</p>
      <div class="ix-source">svc-identity · /api/identity/trpc</div>
    </div>

    <!-- ── where you stand ──────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('uc.identity.current') }}</h2>
        <span class="ix-sub">kyc.status</span>
      </div>

      <IxState
        :loading="status.loading"
        :reason="status.reason"
        :message="status.message"
        endpoint="/api/identity/trpc/kyc.status"
      >
        <div v-if="status.data">
          <div class="tier-row">
            <span class="k">{{ $t('uc.identity.tier') }}</span>
            <span class="v">{{ $t('uc.identity.tiers.' + status.data.tier) }}</span>
          </div>
          <p class="ix-lead">{{ $t('uc.identity.tierMeaning') }}</p>

          <div v-if="status.data.records.length" class="ix-scroll">
            <table class="ix-table">
              <thead>
                <tr>
                  <th>{{ $t('uc.identity.submitted') }}</th>
                  <th>{{ $t('uc.identity.tier') }}</th>
                  <th>{{ $t('uc.identity.jurisdiction') }}</th>
                  <th>{{ $t('uc.identity.recordStatus') }}</th>
                  <th>{{ $t('uc.identity.reviewed') }}</th>
                  <th>{{ $t('uc.identity.expires') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in status.data.records" :key="r.id">
                  <td>{{ r.createdAt | dateFormat }}</td>
                  <td>{{ $t('uc.identity.tiers.' + r.tier) }}</td>
                  <td>{{ r.jurisdiction }}</td>
                  <td>{{ $t('uc.identity.recordStates.' + r.status) }}</td>
                  <td>{{ r.reviewedAt ? (r.reviewedAt | dateFormat) : '—' }}</td>
                  <td>{{ r.expiresAt ? (r.expiresAt | dateFormat) : $t('uc.identity.noExpiry') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="ix-note ix-note-quiet">{{ $t('uc.identity.noRecords') }}</div>
        </div>
      </IxState>
    </div>

    <!-- ── ask to be verified ───────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('uc.identity.apply') }}</h2>
        <span class="ix-sub">kyc.submit</span>
      </div>
      <p class="ix-lead">{{ $t('uc.identity.applyLead') }}</p>

      <Form :label-width="160" class="ident-form">
        <FormItem :label="$t('uc.identity.tier')">
          <Select v-model="form.tier" style="width:280px">
            <Option value="basic">{{ $t('uc.identity.tiers.basic') }}</Option>
            <Option value="full">{{ $t('uc.identity.tiers.full') }}</Option>
            <Option value="institutional">{{ $t('uc.identity.tiers.institutional') }}</Option>
          </Select>
        </FormItem>

        <FormItem :label="$t('uc.identity.jurisdiction')">
          <Input v-model="form.jurisdiction" style="width:120px" maxlength="2" placeholder="GB" />
          <span class="hint">{{ $t('uc.identity.jurisdictionHint') }}</span>
        </FormItem>

        <p v-if="submitError" class="ix-empty ix-empty-error" role="alert">{{ submitError }}</p>
        <p v-if="submitted" class="ix-ok" role="status">{{ $t('uc.identity.submitted_ok') }}</p>

        <FormItem>
          <Button type="primary" :loading="submitting" @click="submit">
            {{ $t('uc.identity.submitBtn') }}
          </Button>
        </FormItem>
      </Form>

      <!--
        The vendor's merchant flow had two more steps, and both are absent here.
        Named rather than quietly dropped, because a merchant reading this page
        needs to know the process is incomplete, not just different.
      -->
      <IxState reason="no_surface" :message="$t('uc.identity.missingSteps')" />
    </div>
  </div>
</template>

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

<style scoped>
.ident-page {
  padding-top: 80px;
}
.ident-form {
  max-width: 640px;
}
.tier-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 8px;
}
.tier-row .k {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ix-text-faint, #6b7280);
}
.tier-row .v {
  font-size: 20px;
  color: var(--ix-text, #e8ebf0);
}
.ix-lead {
  color: var(--ix-text-dim, #8a909c);
  font-size: 13.5px;
  line-height: 1.6;
  margin: 0 0 16px;
}
.hint {
  margin-left: 10px;
  font-size: 12px;
  color: var(--ix-text-faint, #6b7280);
}
.ix-ok {
  color: var(--ix-up, #00b275);
  font-size: 13px;
  margin: 0 0 12px;
}
</style>

<script>
/**
 * VERIFICATION — svc-identity `kyc.status` and `kyc.submit`.
 *
 * WHY THIS SCREEN MATTERS MORE THAN ITS VENDOR ORIGINAL DID. The tier shown here
 * is the one the jurisdiction matrix reads, and it is what refuses the OTC offer
 * list to a fresh account (`module: 'p2p'` is custodial, so §22 gates it behind
 * a tier). A reader who cannot see the P2P book is sent here by the refusal on
 * that screen, and this is where they can do something about it.
 *
 * WHAT `kyc.submit` DOES AND DOES NOT DO. It records a REQUEST — the contract's
 * own comment is "Grants nothing." Approval is a separate operator action
 * (`kyc.approve`, scoped `admin:compliance` plus a second factor) against the
 * record. So this form must not read as "get verified"; it reads as "ask to be
 * verified", and the status table above shows the request sitting at `pending`
 * until a human moves it.
 *
 * NO userId INPUT, deliberately, and worth not undoing: `kyc.submit` reads the
 * identity from the token, so there is no way to submit on somebody else's
 * behalf. The vendor's equivalent posted a member id from the form.
 *
 * WHAT WAS REMOVED FROM THE MERCHANT FLOW:
 *
 * - DOCUMENT UPLOAD. Two `<Upload>` controls posting images to
 *   `/uc/upload/oss/image` on the Java backend. There is no document store
 *   behind our edge and no upload route at all. `kyc.submit` accepts a
 *   `providerRef` string — a pointer to a document held by an outside verifier —
 *   but no such integration exists, so there is nothing to put in it and the
 *   field is not shown rather than shown and ignored.
 * - THE MERCHANT DEPOSIT. `/uc/approve/business-auth-deposit/list` returned the
 *   coin and amount a merchant had to lock as a bond. That is a money movement,
 *   and there is no recipe for it: nothing in the ledger client posts a merchant
 *   bond. Rendering a deposit requirement we cannot take, or worse taking one
 *   outside the ledger, are both out of the question.
 *
 * Both are stated on the page. A merchant applying through this form is being
 * verified, not bonded, and should not think otherwise.
 */
import IxState from "../../components/intafaced/IxState.vue";
import ixModule from "../../components/intafaced/module-mixin.js";
import { query, mutate } from "../../config/intafaced.js";

export default {
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      status: this.emptySection(),
      submitting: false,
      submitted: false,
      submitError: "",
      form: {
        tier: "basic",
        jurisdiction: ""
      }
    };
  },
  methods: {
    refresh() {
      this.load("status", query("identity", "kyc.status", undefined, this.ixToken));
    },
    submit() {
      var self = this;
      this.submitError = "";
      this.submitted = false;

      // The contract wants exactly two letters and uppercases them itself. Check
      // here so the reader is told which field is wrong rather than being handed
      // a schema error.
      if (!/^[A-Za-z]{2}$/.test(this.form.jurisdiction)) {
        this.submitError = this.$t("uc.identity.badJurisdiction");
        return;
      }

      this.submitting = true;
      mutate(
        "identity",
        "kyc.submit",
        { tier: this.form.tier, jurisdiction: this.form.jurisdiction.toUpperCase() },
        this.ixToken
      ).then(function (res) {
        self.submitting = false;
        if (!res.ok) {
          self.submitError = res.message;
          return;
        }
        self.submitted = true;
        // Re-read rather than pushing the new record in locally: the tier is
        // derived server-side from approved, unexpired records, and a submitted
        // request changes no tier at all.
        self.refresh();
      });
    }
  },
  created() {
    this.$store.commit("navigate", "nav-other");
    this.refresh();
  }
};
</script>
