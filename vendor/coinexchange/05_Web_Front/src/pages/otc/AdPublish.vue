<template>
  <div class="content-wrap">
    <div class="container" id="List">
      <div class="ad-head">
        <h2>{{ $t('otc.publishad.createad') }}</h2>
        <p>{{ $t('otc.publishad.lead') }}</p>
      </div>

      <Form ref="form" :model="form" :label-width="150" class="ad-form">
        <FormItem :label="$t('otc.side')">
          <RadioGroup v-model="form.side">
            <Radio label="sell">{{ $t('otc.publishad.iAmSelling') }}</Radio>
            <Radio label="buy">{{ $t('otc.publishad.iAmBuying') }}</Radio>
          </RadioGroup>
        </FormItem>

        <FormItem :label="$t('otc.asset')">
          <Input v-model="form.asset" style="width:200px" :placeholder="$t('otc.publishad.assetTip')" />
        </FormItem>

        <FormItem :label="$t('otc.fiat')">
          <IxState
            :loading="fiat.loading"
            :reason="fiat.reason"
            :message="fiat.message"
            endpoint="/api/p2p/trpc/fiat.list"
          >
            <Select v-model="form.fiatCurrency" filterable style="width:320px">
              <Option v-for="f in fiat.data || []" :key="f.code" :value="f.code">
                {{ f.code }} — {{ f.name }} ({{ f.symbol }})
              </Option>
            </Select>
          </IxState>
        </FormItem>

        <FormItem :label="$t('otc.priceType')">
          <RadioGroup v-model="form.priceType">
            <Radio label="fixed">{{ $t('otc.publishad.fixed') }}</Radio>
            <Radio label="float">{{ $t('otc.publishad.float') }}</Radio>
          </RadioGroup>
        </FormItem>

        <FormItem :label="$t('otc.price')">
          <Input v-model="form.price" style="width:200px" placeholder="0.00">
          <span slot="append">{{ form.fiatCurrency || '—' }}</span>
          </Input>
        </FormItem>

        <FormItem :label="$t('otc.publishad.minAmount')">
          <Input v-model="form.minAmount" style="width:200px" placeholder="0.00">
          <span slot="append">{{ form.asset || '—' }}</span>
          </Input>
        </FormItem>

        <FormItem :label="$t('otc.publishad.maxAmount')">
          <Input v-model="form.maxAmount" style="width:200px" placeholder="0.00">
          <span slot="append">{{ form.asset || '—' }}</span>
          </Input>
        </FormItem>

        <FormItem :label="$t('otc.publishad.totalAmount')">
          <Input v-model="form.totalAmount" style="width:200px" :placeholder="$t('otc.publishad.totalOptional')">
          <span slot="append">{{ form.asset || '—' }}</span>
          </Input>
        </FormItem>

        <FormItem :label="$t('otc.paymethod')">
          <Input v-model="form.methods" style="width:420px" :placeholder="$t('otc.publishad.methodsTip')" />
        </FormItem>

        <FormItem :label="$t('otc.terms')">
          <Input
            v-model="form.terms"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 8 }"
            style="width:520px"
            :placeholder="$t('otc.publishad.termsTip')"
          />
        </FormItem>

        <p v-if="error" class="ix-empty ix-empty-error" role="alert">{{ error }}</p>

        <FormItem>
          <Button type="primary" :loading="saving" @click="submit">{{ $t('otc.publishad.publish') }}</Button>
          <router-link to="/uc/ad" style="margin-left:12px;">{{ $t('common.cancel') }}</router-link>
        </FormItem>
      </Form>

      <!--
        Four vendor fields have no counterpart in `offers.create` and are gone
        rather than collected and dropped. Named so the gap is a work item
        instead of a rediscovery.
      -->
      <div class="ad-socket">
        <IxState reason="no_surface" :message="$t('otc.publishad.droppedFields')" />
      </div>
    </div>
  </div>
</template>

<style>
.my_ad_container.my_ad_container_spin.ivu-spin-fix.ivu-spin-main {
  top: 200px;
}
</style>

<style scoped lang="scss">
.my_ad_container {
  width: 80%;
  float: right;
}
.cankao {
  color: #e24a64;
}
.contbox {
  position: relative;
}
#price {
  font-size: 18px;
  color: #e24a64;
}

.send-box.send-form.msg {
  padding-left: 90px;
  margin-bottom: 10px;
  position: relative;
  top: -4px;
}

.formbox {
  width: 50%;
  padding-top: 30px;
}

.send-box {
  color: #fff;
  padding: 32px;
}

.title-box {
  /*border-left: 1px dashed #ebeff5;*/
  border-bottom: 1px dashed #ccc;
  padding-bottom: 30px;
  text-align: left;
  padding-left: 18px;
}

.title-box.titles {
  font-size: 18px;
  font-weight: normal;
  color: #fff;
  margin-bottom: 15px;
}

.title-box p {
  line-height: 2;
}

.title-box p a {
  color: #00c2a8;
}

.order-table {
  margin-top: 20px;
}

.content-wrap {
  // background: #f5f5f5;
  min-height: 750px;
}

.container {
  margin: 0 auto;
}
</style>

<style scoped>
.ad-head {
  padding: 20px 0 10px;
}
.ad-head h2 {
  color: var(--ix-text, #e8ebf0);
  font-size: 22px;
}
.ad-head p {
  color: var(--ix-text-dim, #8a909c);
  font-size: 13.5px;
  margin-top: 6px;
}
.ad-form {
  max-width: 760px;
  padding-bottom: 20px;
}
.ad-socket {
  max-width: 760px;
  margin-bottom: 40px;
}
</style>

<script>
/**
 * POST AN OFFER — svc-p2p `offers.create`.
 *
 * MONEY IS NEVER A NUMBER HERE. Worth stating precisely, because the vendor's
 * version did the opposite in a way that is easy to miss:
 *
 *     isIdparams["price"] = (this.price + "").replace(/[^\d|.]/g, "") - 0;
 *
 * That trailing `- 0` coerces the price to a JS number before it is sent. Every
 * offer posted through that form went over the wire as a float. Here `price`,
 * `minAmount`, `maxAmount` and `totalAmount` are bound as strings, validated
 * against the contract's own `amountString` rule, and sent as strings.
 *
 * THE CURRENCY LIST IS REAL. `fiat.list` is a `publicProcedure` served straight
 * out of `packages/config` — the enabled-currency table, not a hardcoded CNY as
 * the vendor assumed throughout. It answers without a session, so the select is
 * populated even before the rest of the form can be submitted.
 *
 * WHAT `offers.create` DOES NOT ACCEPT, and is therefore not asked for:
 *
 * - `timeLimit` — the payment window. Deadlines are set by svc-p2p's own policy
 *   (`deadlineFor` in state.ts), not per offer.
 * - `country` — no jurisdiction field on an offer; jurisdiction is decided by
 *   the matrix against the caller's KYC record.
 * - `premiseRate` — the margin over spot for a floating-price offer. `priceType`
 *   is accepted, but the float reference and margin are not, so a "float" offer
 *   currently carries only the price given here.
 * - `auto` / `autoword` — auto-reply, which needs the messaging service that
 *   does not exist.
 * - `jyPassword` — a transaction password. No such concept in svc-identity.
 *
 * EDIT MODE IS GONE. The route `/uc/ad/update` reached this same component and
 * posted to `/otc/advertise/update`. There is no update procedure on svc-p2p —
 * an offer is created and later closed. Rather than silently creating a second
 * offer when a maker thought they were editing one, the update route now lands
 * on a create form that says so.
 */
import IxState from "../../components/intafaced/IxState.vue";
import ixModule from "../../components/intafaced/module-mixin.js";
import { query, mutate } from "../../config/intafaced.js";

/** The contract's rule, character for character. */
var AMOUNT_RE = /^\d+(\.\d{1,18})?$/;

export default {
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      fiat: this.emptySection(),
      saving: false,
      error: "",
      form: {
        side: "sell",
        asset: "",
        fiatCurrency: "",
        priceType: "fixed",
        price: "",
        minAmount: "",
        maxAmount: "",
        totalAmount: "",
        methods: "",
        terms: ""
      }
    };
  },
  methods: {
    /** One rule, one message, so a bad field is named rather than "check the form". */
    firstProblem() {
      var f = this.form;
      if (!f.asset) return this.$t("otc.publishad.needAsset");
      if (!f.fiatCurrency) return this.$t("otc.publishad.needCurrency");
      if (!AMOUNT_RE.test(f.price)) return this.$t("otc.publishad.badPrice");
      if (!AMOUNT_RE.test(f.minAmount)) return this.$t("otc.publishad.badMin");
      if (!AMOUNT_RE.test(f.maxAmount)) return this.$t("otc.publishad.badMax");
      if (f.totalAmount && !AMOUNT_RE.test(f.totalAmount)) return this.$t("otc.publishad.badTotal");
      // Deliberately NOT comparing min against max here: that comparison needs
      // decimal arithmetic, and doing it with JS numbers is exactly the thing
      // this file exists to avoid. svc-p2p holds both as scaled bigints and is
      // the right place for the check.
      return "";
    },
    submit() {
      var self = this;
      this.error = this.firstProblem();
      if (this.error) return;

      var f = this.form;
      var input = {
        side: f.side,
        asset: f.asset.toUpperCase(),
        fiatCurrency: f.fiatCurrency,
        priceType: f.priceType,
        price: f.price,
        minAmount: f.minAmount,
        maxAmount: f.maxAmount
      };
      if (f.totalAmount) input.totalAmount = f.totalAmount;
      if (f.terms) input.terms = f.terms;

      // `methods` is `z.array(z.unknown())`, so a list of plain strings is a
      // valid value. Split on commas and drop the blanks rather than sending
      // one string containing commas, which would read as a single rail named
      // "Bank transfer, Wise".
      var methods = f.methods
        .split(",")
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s; });
      if (methods.length) input.methods = methods;

      this.saving = true;
      mutate("p2p", "offers.create", input, this.ixToken).then(function (res) {
        self.saving = false;
        if (!res.ok) {
          self.error = res.message;
          return;
        }
        self.$router.push("/uc/ad");
      });
    }
  },
  created() {
    this.$store.commit("navigate", "nav-otc");
    this.load("fiat", query("p2p", "fiat.list", undefined, this.ixToken));
  }
};
</script>
