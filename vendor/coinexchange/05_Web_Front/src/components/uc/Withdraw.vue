<template>
  <div class="nav-rights withdraw">
    <div class="nav-right">
      <div class="rightarea">
        <!-- B3 craft: same shell recipe as MoneyIndex / desk dual-book. -->
        <div class="ix-money ix-withdraw">
        <section class="trade-groups merchant-tops ix-withdraw-nav">
          <!-- <i class="merchant-icon tips"></i>
          <span class="tips-word">{{$t('uc.finance.withdraw.pickup')}}</span> -->
          <router-link to="/uc/withdraw/address">{{$t('uc.finance.withdraw.addressmanager')}}</router-link>
        </section>
        <section>
          <div class="table-inner action-box">
            <!-- <i class="angle" style="right: 27px;"></i> -->
            <div class="action-inner">
              <div class="inner-left">
                <p class="describe">{{$t('uc.finance.withdraw.symbol')}}</p>
                <Select v-model="coinType" style="width:100px;margin-top: 14px;" @on-change="getAddrList">
                  <Option v-for="item in coinList" :value="item.unit" :key="item.unit">{{ item.unit }}</Option>
                </Select>
              </div>
              <div class="inner-box">
                <div class="form-group form-address">
                  <label for="controlAddress" class="controlAddress describe">{{$t('uc.finance.withdraw.address')}}</label>
                  <div class="control-input-group">
                    <Select ref="address" v-model="withdrawAdress" filterable clearable @on-query-change="onAddressChange" :placeholder="$t('common.pleaseselect')">
                      <Option v-for="item in currentCoin.addresses" :value="item.address" :key="item.address">{{ item.remark +'('+ item.address+')' }}</Option>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
            <div class="form-group-container">
              <div class="form-group form-amount">
                <label class="label-amount"> {{$t('uc.finance.withdraw.num')}}
                  <p class="label-fr">
                    <span>[{{$t('uc.finance.withdraw.avabalance')}}]:
                      <span v-if="walletLoading" class="ix-empty-loading" id="valueAvailable">Loading…</span>
                      <span v-else-if="walletReachable" class="label-pointer" id="valueAvailable">{{currentCoin.balance|toFloor}}</span>
                      <span v-else class="ix-dim" id="valueAvailable">— unknown</span>
                    </span>
                    <span v-if="currentCoin.enableAutoWithdraw == 0">[{{$t('common.tip')}}]: {{$t('uc.finance.withdraw.msg1')}} {{currentCoin.threshold}} {{$t('uc.finance.withdraw.msg2')}}</span>
                    <span>
                      <a href="javascript:;" id="levelUp" style="display: none;">{{$t('uc.finance.withdraw.increase')}}</a>
                    </span>
                  </p>
                </label>
                <p class="ix-dualbook" role="note">
                  <strong>Two books.</strong> Venue exchange wallet only — not the platform ledger books.
                </p>
                <p v-if="walletError" class="ix-empty ix-empty-error" role="alert" tabindex="-1">{{ walletError }}</p>
                <div class="input-group">
                  <Poptip trigger="focus" :content="$t('uc.finance.withdraw.tip1')+currentCoin.withdrawScale+$t('uc.finance.withdraw.tip11')+currentCoin.minAmount+','+$t('uc.finance.withdraw.tip2')+currentCoin.maxAmount" style="width: 100%;">
                    <InputNumber @on-change="computerAmount" v-model="withdrawAmount" :placeholder="$t('uc.finance.withdraw.numtip1')" size="large" :min="currentCoin.minAmount" :max="currentCoin.maxAmount"></InputNumber>
                    <span class="input-group-addon addon-tag uppercase firstt">{{currentCoin.unit}}</span>
                  </Poptip>
                </div>
              </div>
            </div>
            <div class="form-group-container form-group-container2">
              <div class="form-group form-fee">
                <label class="label-amount"> {{$t('uc.finance.withdraw.fee')}}
                  <p class="label-fr">
                    <span class="ix-dim">{{ feeSourceLabel }}</span>
                  </p>
                </label>
                <div class="input-group" style="margin-top:14px;position:relative;">
                  <Slider v-if="currentCoin.maxTxFee > currentCoin.minTxFee" v-model="withdrawFee" :step="feeStep" :max="currentCoin.maxTxFee" :min="currentCoin.minTxFee" @on-change="computerAmount"></Slider>
                  <InputNumber readonly v-model="withdrawFee" :min="currentCoin.minTxFee" :max="currentCoin.maxTxFee" size="large" @on-change="computerAmount"></InputNumber>
                  <span class="input-group-addon addon-tag uppercase">{{currentCoin.unit}}</span>
                </div>
              </div>
              <div class="form-group">
                <label>{{$t('uc.finance.withdraw.arriamount')}}
                  <p class="label-fr"><span class="ix-dim">estimate · amount − fee (rounded down)</span></p>
                </label>
                <div class="input-group" style="margin-top:14px;position:relative;">
                  <Input
                    id="withdrawOutAmount"
                    readonly
                    :value="withdrawOutAmountDisplay"
                    :placeholder="$t('uc.finance.withdraw.arriamount')"
                    size="large"
                  />
                  <span class="input-group-addon addon-tag uppercase">{{currentCoin.unit}}</span>
                </div>
                <p v-if="netMathError" class="ix-empty ix-empty-error" role="alert">{{ netMathError }}</p>
              </div>
            </div>
            <div class="action-foot">
              <Button
                id="withdrawSubmit"
                long
                size="large"
                type="primary"
                style="height:40px;"
                :disabled="submitting"
                :loading="submitting"
                @click="apply"
              >{{$t('uc.finance.withdraw.pickup')}}</Button>
            </div>
            <div class="action-content pt10">
              <div class="action-body">
                <p class="acb-p1">{{$t('common.tip')}}</p>
                <p class="acb-p2">• {{$t('uc.finance.withdraw.msg3')}}: {{currentCoin.minAmount}} {{coinType}}. <br>• {{$t('uc.finance.withdraw.msg5')}}<br>• {{$t('uc.finance.withdraw.msg6')}} </p>
              </div>
            </div>
            <div class="action-content">
              <div class="action-body">
                <p class="acb-p1">{{$t('uc.finance.withdraw.record')}}</p>
                <div class="order-table">
                  <p class="acb-p2" style="margin-bottom:10px;">• {{$t('uc.finance.withdraw.click')}}
                    <i class="ivu-icon ivu-icon-funnel"></i>{{$t('uc.finance.withdraw.filtrate')}}</p>
                  <p v-if="listError" class="ix-empty ix-empty-error" role="alert" tabindex="-1">{{ listError }}</p>
                  <p v-else-if="!loading && listReachable && tableWithdraw.length === 0" class="ix-empty">No withdrawals yet</p>
                  <Table v-if="!listError" :no-data-text="$t('common.nodata')" :columns="tableColumnsWithdraw" :data="tableWithdraw" :loading="loading"></Table>
                  <div id="pages" v-if="!listError">
                    <div style="float: right;">
                      <Page class="pages_a" :total="transaction.total" :current="transaction.page + 1" @on-change="changePage"></Page>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        </div><!-- /.ix-money.ix-withdraw -->
      </div>
    </div>
    <Modal v-model="modal" width="480" :mask-closable="!submitting" :closable="!submitting">
      <p slot="header">
        Review withdrawal
      </p>
      <div class="ix-withdraw-receipt" role="region" aria-label="Withdrawal review receipt">
        <dl class="ix-receipt-dl">
          <div>
            <dt>Asset</dt>
            <dd>{{ receipt.unit || '—' }}</dd>
          </div>
          <div>
            <dt>Amount</dt>
            <dd>{{ receipt.amount || '—' }} <em v-if="receipt.unit">{{ receipt.unit }}</em></dd>
          </div>
          <div>
            <dt>Fee</dt>
            <dd>{{ receipt.fee || '—' }} <em v-if="receipt.unit">{{ receipt.unit }}</em>
              <span class="ix-dim"> · {{ receipt.feeSource }}</span>
            </dd>
          </div>
          <div>
            <dt>You will receive (est.)</dt>
            <dd class="ix-receipt-net">{{ receipt.net || '—' }} <em v-if="receipt.unit">{{ receipt.unit }}</em></dd>
          </div>
          <div>
            <dt>To address</dt>
            <dd class="ix-receipt-addr">
              <span>{{ receipt.address || '—' }}</span>
              <button
                v-if="receipt.address"
                type="button"
                class="ix-copy-addr"
                @click="copyReceiptAddress"
              >Copy</button>
            </dd>
          </div>
        </dl>
        <p class="ix-empty" role="note">Estimate only — final settlement is what the venue accepts. Failed request does not mean sent.</p>
      </div>
      <Form class="withdraw-form-inline" ref="formInline" :model="formInline" inline>
        <FormItem prop="code">
          <Input type="text" v-model="formInline.code" :placeholder="$t('uc.regist.smscode')" :disabled="submitting">
          </Input>
          <input id="sendCode" @click="sendCode();" type="Button" :value="sendcodeValue" :disabled="codeIsSending || submitting">
          </input>
        </FormItem>
        <FormItem>
          <Input type="password" v-model="formInline.fundpwd" :placeholder="$t('otc.chat.msg7')" :disabled="submitting"></Input>
        </FormItem>
      </Form>
      <div slot="footer" class="ix-withdraw-footer">
        <Button type="text" :disabled="submitting" @click="cancel">Cancel</Button>
        <Button
          type="primary"
          :loading="submitting"
          :disabled="submitting"
          @click="ok"
        >{{ submitting ? 'Submitting…' : 'Confirm' }}</Button>
      </div>
    </Modal>
  </div>
</template>
<script>
var withdrawMath = require('../../assets/js/withdraw-math.js');

export default {
  data() {
    return {
      user: {},
      codeIsSending: false,
      sendcodeValue: this.$t("uc.regist.sendcode"),
      countdown: 60,
      formInline: {
        code: "",
        fundpwd: ""
      },
      modal: false,
      submitting: false,
      fundpwd: "",
      currentCoin: {},
      transaction: {
        page: 0,
        pageSize: 10,
        total: 0
      },
      loading: true,
      walletLoading: true,
      walletReachable: false,
      walletError: "",
      listReachable: false,
      listError: "",
      withdrawAdress: "",
      inputAddress: "", //address entered by the user
      withdrawAmount: 0,
      withdrawFee: 0,
      /** Display string for net receive — never IEEE float math. */
      withdrawOutAmountDisplay: "—",
      netMathError: "",
      receipt: {
        unit: "",
        amount: "",
        fee: "",
        feeSource: "",
        net: "",
        address: ""
      },
      coinType: "",
      coinList: [],
      tableWithdraw: [],
      allTableWithdraw: []
    };
  },
  watch: {
    currentCoin: function() {
      var min = Number(this.currentCoin.minTxFee) || 0;
      var max = Number(this.currentCoin.maxTxFee) || 0;
      this.withdrawFee = min + (max - min) / 2;
      this.computerAmount();
    },
    withdrawAmount: function() {
      this.computerAmount();
    },
    withdrawFee: function() {
      this.computerAmount();
    }
  },
  methods: {
    cancel() {
      if (this.submitting) return;
      this.modal = false;
      this.formInline.code = "";
      this.formInline.fundpwd = "";
    },
    /* Wave B9′ — copy full destination address from the review receipt. */
    copyReceiptAddress() {
      var id = this.receipt && this.receipt.address ? String(this.receipt.address) : "";
      if (!id) {
        this.$Notice.warning({ title: "No address", desc: "Nothing to copy." });
        return;
      }
      var done = () =>
        this.$Notice.success({ title: "Copied", desc: "Withdrawal address on clipboard." });
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(id).then(done).catch(() => {
          if (this.fallbackCopyText(id)) done();
        });
      } else if (this.fallbackCopyText(id)) {
        done();
      }
    },
    fallbackCopyText(text) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch (e) {
        return false;
      }
    },
    sendCode() {
      if (this.codeIsSending || this.submitting) return;
      this.$http
        .post(this.host + "/uc/mobile/withdraw/code")
        .then(response => {
          var resp = response.body;
          if (resp.code == 0) {
            this.settime();
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
        })
        .catch(() => {
          this.$Notice.error({
            title: this.$t("common.tip"),
            desc: "SMS code was not sent — network error. Try again."
          });
        });
    },
    settime() {
      this.sendcodeValue = this.countdown;
      this.codeIsSending = true;
      let timercode = setInterval(() => {
        this.countdown--;
        this.sendcodeValue = this.countdown;
        if (this.countdown <= 0) {
          clearInterval(timercode);
          this.sendcodeValue = this.$t("uc.regist.sendcode");
          this.countdown = 60;
          this.codeIsSending = false;
        }
      }, 1000);
    },
    changePage(index) {
      this.transaction.page = index - 1;
      this.getList();
    },
    onAddressChange(data) {
      this.inputAddress = data;
    },
    clearValues() {
      if (this.$refs.address) {
        this.$refs.address.setQuery(" ");
      }
      this.withdrawAdress = "";
      this.inputAddress = "";
      this.withdrawAmount = 0;
      this.withdrawOutAmountDisplay = "—";
      this.netMathError = "";
      this.receipt = {
        unit: "",
        amount: "",
        fee: "",
        feeSource: "",
        net: "",
        address: ""
      };
    },
    buildReceipt() {
      var unit = (this.currentCoin && this.currentCoin.unit) || this.coinType || "";
      var scale =
        this.currentCoin && this.currentCoin.withdrawScale != null
          ? this.currentCoin.withdrawScale
          : 8;
      var amountStr = withdrawMath.formatAmount
        ? withdrawMath.formatAmount(this.withdrawAmount, scale)
        : String(this.withdrawAmount);
      var feeStr = withdrawMath.formatAmount
        ? withdrawMath.formatAmount(this.withdrawFee, scale)
        : String(this.withdrawFee);
      this.receipt = {
        unit: unit,
        amount: amountStr || "—",
        fee: feeStr || "—",
        feeSource: this.feeSourceLabel,
        net: this.withdrawOutAmountDisplay,
        address: this.withdrawAdress || this.inputAddress || ""
      };
    },
    getCurrentCoinRecharge() {
      if (this.coinType!= "") {
        var temp = [];
        for (var i = 0; i < this.allTableWithdraw.length; i++) {
          // if (this.allTableWithdraw[i].symbol == this.coinType) {
          if (this.allTableWithdraw[i].coin.unit == this.coinType) {
            temp.push(this.allTableWithdraw[i]);
          }
        }
        this.tableWithdraw = temp;
      } else {
        this.tableWithdraw = this.allTableWithdraw;
      }
    },
    ok() {
      if (this.submitting) return;
      if (!this.$store.getters.isLogin) {
        this.$Message.error("Session ended — sign in again. Withdrawal was not submitted.");
        this.modal = false;
        return;
      }
      if (this.formInline.code == "") {
        this.modal = true;
        this.$Message.error("Enter the SMS code");
        return;
      }
      if (this.formInline.fundpwd == "") {
        this.modal = true;
        this.$Message.error(this.$t("otc.chat.msg7tip"));
        return;
      }
      if (this.netMathError || !this.receipt.net || this.receipt.net === "—") {
        this.$Message.error(
          this.netMathError || "Cannot confirm — net amount is unknown."
        );
        return;
      }
      let params = {};
      var addrs = (this.currentCoin && this.currentCoin.addresses) || [];
      for (let i = 0; i < addrs.length; i++) {
        if (addrs[i].address == this.withdrawAdress) {
          params["remark"] = addrs[i].remark;
        }
      }

      params["unit"] = this.currentCoin.unit;
      params["address"] = this.withdrawAdress;
      params["amount"] = this.receipt.amount;
      params["fee"] = this.receipt.fee;
      params["jyPassword"] = this.formInline.fundpwd;
      params["code"] = this.formInline.code;
      this.submitting = true;
      this.$http
        .post(this.host + "/uc/withdraw/apply/code", params)
        .then(response => {
          this.submitting = false;
          this.fundpwd = "";
          var resp = response.body;
          if (!resp) {
            this.$Message.error(
              "Venue did not respond — withdrawal was not submitted."
            );
            return;
          }
          if (resp.code == 0) {
            this.modal = false;
            this.formInline.code = "";
            this.formInline.fundpwd = "";
            this.transaction.page = 0;
            this.getList();
            this.clearValues();
            this.$Message.success(resp.message);
          } else {
            this.$Message.error(resp.message || "Withdrawal rejected");
          }
        })
        .catch(() => {
          this.submitting = false;
          this.$Message.error(
            "Venue did not respond — withdrawal was not submitted."
          );
        });
    },
    getAddrList() {
      this.clearValues();
      this.walletLoading = true;
      this.walletReachable = false;
      this.walletError = "";
      this.$http
.post(this.host + "/uc/withdraw/support/coin/info")
.then(response => {
          var resp = response.body;
          if (resp && resp.code == 0 && resp.data && resp.data.length > 0) {
            this.coinList = resp.data;
            if (this.coinType) {
              for (let i = 0; i < resp.data.length; i++) {
                if (this.coinType == resp.data[i].unit) {
                  this.currentCoin = resp.data[i];
                  break;
                }
              }
            } else {
              this.currentCoin = this.coinList[0];
              this.coinType = this.currentCoin.unit;
            }
            this.walletReachable = true;
            this.walletLoading = false;
          } else {
            /* Failed fetch must not look like $0 balance available. */
            this.walletError =
              "Wallet did not answer — available balance is unknown, not zero.";
            this.walletLoading = false;
            if (resp && resp.message) this.$Message.error(resp.message);
          }
        })
        .catch(() => {
          this.walletError =
            "Wallet service did not respond — available balance is unknown, not zero.";
          this.walletLoading = false;
        });
    },
    getList() {
      this.loading = true;
      this.listReachable = false;
      this.listError = "";
      // tableWithdraw
      let params = {};
      params["page"] = this.transaction.page;
      params["pageSize"] = this.transaction.pageSize;
      this.$http
.post(this.host + "/uc/withdraw/record", params)
.then(response => {
          var resp = response.body;
          if (resp && resp.code == 0) {
            this.tableWithdraw = (resp.data && resp.data.content) || [];
            this.transaction.total = (resp.data && resp.data.totalElements) || 0;
            this.transaction.page = (resp.data && resp.data.number) || 0;
            this.listReachable = true;
            this.loading = false;
          } else {
            this.listError =
              "Withdraw history did not answer — list is unknown, not empty.";
            this.loading = false;
            if (resp && resp.message) this.$Message.error(resp.message);
          }
        })
        .catch(() => {
          this.listError =
            "Withdraw history service did not respond — list is unknown, not empty.";
          this.loading = false;
        });
    },
    computerAmount() {
      this.netMathError = "";
      var scale =
        this.currentCoin && this.currentCoin.withdrawScale != null
          ? this.currentCoin.withdrawScale
          : 8;
      if (!withdrawMath || !withdrawMath.netReceive) {
        this.withdrawOutAmountDisplay = "—";
        this.netMathError = "Net amount unavailable — decimal math module failed to load.";
        return;
      }
      // Empty / zero amount is a form state, not a known net of 0.00 from a failed calc.
      if (
        this.withdrawAmount === "" ||
        this.withdrawAmount === null ||
        this.withdrawAmount === undefined
      ) {
        this.withdrawOutAmountDisplay = "—";
        return;
      }
      var result = withdrawMath.netReceive(
        this.withdrawAmount,
        this.withdrawFee,
        scale
      );
      if (!result.ok) {
        this.withdrawOutAmountDisplay = "—";
        if (result.error === "fee_exceeds_amount") {
          this.netMathError = "Fee is larger than amount — you would receive nothing.";
        } else if (result.error === "invalid_amount_or_fee") {
          this.withdrawOutAmountDisplay = "—";
          this.netMathError = "";
        } else {
          this.netMathError = "Cannot compute net receive (" + result.error + ").";
        }
        return;
      }
      this.withdrawOutAmountDisplay = result.net;
    },
    valid() {
      this.withdrawAdress = this.withdrawAdress || this.inputAddress;
      if (this.coinType == "") {
        this.$Message.error(this.$t("uc.finance.withdraw.symboltip"));
        return false;
      } else if (this.withdrawAdress == "") {
        this.$Message.error(this.$t("uc.finance.withdraw.addresstip"));
        return false;
      } else if (
        this.withdrawAmount == "" ||
        this.withdrawAmount == 0 ||
        this.withdrawAmount - 0 < this.currentCoin.minAmount
      ) {
        this.$Message.error(
          this.$t("uc.finance.withdraw.numtip2") + this.currentCoin.minAmount
        );
        return false;
      } else if (this.withdrawAmount - 0 < this.withdrawFee) {
        this.$Message.error(this.$t("uc.finance.withdraw.numtip3"));
        return false;
      } else if (
        this.withdrawFee === "" ||
        this.withdrawFee === null ||
        this.withdrawFee - 0 > this.currentCoin.maxTxFee ||
        this.withdrawFee - 0 < this.currentCoin.minTxFee
      ) {
        this.$Message.error(
          this.$t("uc.finance.withdraw.feetip1") +
            this.currentCoin.minTxFee +
            ", " +
            this.$t("uc.finance.withdraw.feetip2") +
            this.currentCoin.maxTxFee
        );
        return false;
      } else if (this.netMathError || this.withdrawOutAmountDisplay === "—") {
        this.$Message.error(
          this.netMathError || "Net amount is unknown — fix amount/fee first."
        );
        return false;
      } else {
        return true;
      }
    },
    apply() {
      if (this.submitting) return;
      if (this.valid()) {
        this.computerAmount();
        this.buildReceipt();
        this.modal = true;
        let timercode = setInterval(() => {
          if (this.countdown <= 0) {
            clearInterval(timercode);
            this.sendcodeValue = this.$t("uc.regist.sendcode");
            this.codeIsSending = false;
          }
        }, 1000);
      }
    },
    getMember() {
      // Secure
      let self = this;
      this.$http.post(this.host + "/uc/approve/security/setting").then(response => {
          var resp = response.body;
          if (resp.code == 0) {
            this.user = resp.data;
            if (resp.data.realName == null || resp.data.realName == "") {
              this.$Notice.error({
                title: this.$t("common.tip"),
                desc: this.$t("otc.publishad.submittip1")
              });
              // , ;
              //this.$Message.success(this.$t("otc.publishad.submittip1"));
              self.$router.push("/uc/safe");
            } else if (resp.data.phoneVerified == 0) {
              this.$Notice.error({
                title: this.$t("common.tip"),
                desc: this.$t("otc.publishad.submittip2")
              });
              // phone0, 1, ;
              //this.$Message.success(this.$t("otc.publishad.submittip2"));
              self.$router.push("/uc/safe");
            } else if (resp.data.fundsVerified == 0) {
              this.$Notice.error({
                title: this.$t("common.tip"),
                desc: this.$t("otc.publishad.submittip3")
              });
              // Set, ;
              //this.$Message.success(this.$t("otc.publishad.submittip3"));
              self.$router.push("/uc/safe");
            }
          } else {
            this.$Message.error(resp.message);
          }
        });
    }
  },
  created() {
    this.getMember();
    this.$http.options.emulateJSON = false;
    this.coinType = this.$route.query.name || "";
    this.getAddrList();
    this.getList(0, 10, 1);
    console.log(this.$store.getters.member);
  },
  computed: {
    member: function() {
      console.log(this.$store.getters.member);
      return this.$store.getters.member;
    },
    feeSourceLabel() {
      var min = this.currentCoin && this.currentCoin.minTxFee;
      var max = this.currentCoin && this.currentCoin.maxTxFee;
      if (min == null && max == null) {
        return "Fee source: unknown (venue did not provide a range)";
      }
      if (min === max || max == null) {
        return "Fee source: venue fixed fee (" + min + ")";
      }
      return "Fee source: venue range " + min + "–" + max + " (you choose within range)";
    },
    feeStep() {
      var min = Number(this.currentCoin && this.currentCoin.minTxFee) || 0;
      var max = Number(this.currentCoin && this.currentCoin.maxTxFee) || 0;
      if (!(max > min)) return 0.00000001;
      return (max - min) / 10;
    },
    tableColumnsWithdraw() {
      let columns = [],
        filters = [];
      if (this.coinList.length > 0) {
        this.coinList.forEach(v => {
          filters.push({
            label: v.unit,
            value: v.unit
          });
        });
      }
      columns.push({
        title: this.$t("uc.finance.withdraw.time"),
        width: 180,
        key: "createTime"
      });
      columns.push({
        title: this.$t("uc.finance.withdraw.symbol"),
        key: "symbol",
        filters,
        filterMultiple: false,
        filterMethod(value, row) {
          return row.coin.unit === value;
        },
        render: function(h, params) {
          return h("span", params.row.coin.unit);
        }
      });
      columns.push({
        title: this.$t("uc.finance.withdraw.address"),
        key: "address"
      });
      columns.push({
        title: this.$t("uc.finance.withdraw.num"),
        key: "totalAmount"
      });
      columns.push({
        title: this.$t("uc.finance.withdraw.fee"),
        key: "fee"
      });
      columns.push({
        title: this.$t("uc.finance.withdraw.txid"),
        key: "transactionNumber"
      });
      columns.push({
        title: this.$t("uc.finance.withdraw.status"),
        key: "status",
        render: (h, params) => {
          let text = "";
          if (params.row.status == 0) {
            text = this.$t("uc.finance.withdraw.status_1");
          } else if (params.row.status == 1) {
            text = this.$t("uc.finance.withdraw.status_2");
          } else if (params.row.status == 2) {
            text = this.$t("uc.finance.withdraw.status_3");
          } else if (params.row.status == 3) {
            text = this.$t("uc.finance.withdraw.status_4");
          }
          return h("div", [h("p", text)]);
        }
      });
      return columns;
    }
  }
};
</script>
<style lang="scss">
.withdraw-form-inline {
  padding: 20px 40px 0 40px;
.ivu-input {
    height: 40px;
    line-height: 40px;
  }
}
.ix-withdraw-receipt {
  padding: 0 16px 8px;
}
.ix-receipt-dl {
  margin: 0 0 12px;
  div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  dt {
    color: #8c979f;
    font-size: 13px;
    font-weight: 500;
  }
  dd {
    margin: 0;
    text-align: right;
    font-size: 13px;
    word-break: break-all;
    em {
      font-style: normal;
      opacity: 0.7;
      margin-left: 4px;
    }
  }
  .ix-receipt-net {
    font-weight: 600;
    color: #00c2a8;
  }
  .ix-receipt-addr {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    max-width: 280px;
  }
}
.ix-withdraw-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  align-items: center;
}
.ix-dim {
  opacity: 0.65;
  font-weight: 400;
}
</style>

<style scoped lang="scss">
#sendCode {
  position: absolute;
  border: none;
  background: none;
  top: 10px;
  outline: none;
  right: 0;
  width: 30%;
  color: #1ad4bc;
  cursor: pointer;
  height: 20px;
  line-height: 20px;
  border-left: 1px solid #dddee1;
}
.nav-rights {
.nav-right {
    height: auto;
    overflow: hidden;
    padding: 0 15px;
.rightarea {
      padding-left: 15px;
.trade-groups.merchant-tops {
        font-size: 14px;
        height: 50px;
        padding: 0 15px;
        color: #fff;
        overflow: hidden;
        display: block;
        margin-right: 0;
        a {
          display: inline-block;
          color: #00c2a8;
          width: 160px;
          height: 40px;
          border: 1px solid #00c2a8;
          line-height: 40px;
          text-align: center;
          float: right;
          &:hover{
            background: #00c2a8;
            color: #000;
          }
        }
      }
.action-box {
        padding: 10px 20px 20px;
.form-group-container {
.form-group.form-amount {
.input-group.ivu-poptip {
.ivu-poptip-rel {
                display: block;
.ivu-input-number {
                  width: 100%;
                }
              }
            }
          }
        }
      }
    }
  }
}
.ivu-slider-button-wrap {
  top: -6px;
}
#withdrawAddressList {
  position: absolute;
  height: 0;
  transition: height 0.3s;
  top: 100%;
  left: 0;
  width: 100%;
  z-index: 1;
  max-height: 245px;
  overflow: auto;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.1);
  height: auto;
  background: #fff;
}

#withdrawAddressList.address-item {
  padding: 0 20px;
  display: flex;
  line-height: 48px;
  border-bottom: 1px solid transparent;
  position: relative;
  white-space: nowrap;
  overflow: hidden;
  z-index: 99;
}

#withdrawAddressList.address-item:hover {
  background: #f5f5f5;
  cursor: pointer;
}

#withdrawAddressList.notes {
  position: absolute;
  bottom: 0;
  right: 20px;
  height: 48px;
  line-height: 48px;
  max-width: 300px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

p.describe {
  font-size: 16px;
  font-weight: 600;
}

.acb-p1 {
  font-size: 18px;
  font-weight: 600;
  line-height: 50px;
}

.acb-p2 {
  font-size: 13px;
  line-height: 24px;
  color: #8c979f;
}

.action-content.pt10 {
  padding-top: 10px;
}

.action-content {
  width: 100%;
  margin-top: 20px;
  // overflow: hidden;
  display: table;
}

.action-content.action-body {
  display: table-cell;
  vertical-align: top;
  line-height: 20px;
  font-size: 12px;
  color: #ccc;
}

.action-foot {
  text-align: center;
  padding: 40px 170px 0;
}

.hb-night.btn.btn-primary,
.hb-night.btn.btn_submit {
  background-color: #7a98f7;
  color: white;
}

.action-inner {
  width: 100%;
  display: table;
}

.action-inner.inner-box {
  display: table-cell;
  width: 80%;
}

.form-group {
  position: relative;
  margin-bottom: 20px;
  font-size: 16px;
}

.controlAddress {
  line-height: 50px;
}

.form-group label {
  max-width: 100%;
  font-weight: 600;
}

.control-input-group {
  position: relative;
}

.control-input-group.open.select-list {
  height: auto;
}

.form-group-container {
  display: table;
  width: 100%;
}

.form-group-container.form-amount {
  width: 100%;
}

.form-group-container.form-group {
  display: table-cell;
}

.form-group-container.form-group span.addon-tag:last-child {
  padding: 0;
  border: none;
  background: none;
  cursor: default;
  position: absolute;
  right: 26px;
  top: 6px;
}

.form-group-container.form-group span.addon-tag:last-child.firstt {
  top: 8px;
}

.form-group-container2 {
  padding-top: 20px;
}

.form-group-container.form-fee {
  width: 50%;
  padding: 0 20px 0 0;
}

.label-amount.label-fr {
  float: right;
  color: #aaa;
  font-size: 14px;
}

.label-amount.label-fr span {
  margin-left: 2px;
}

.form-group-container.form-group {
  display: table-cell;
}

.hb-night table.table.table-inner {
  margin: -4px -20px;
  position: relative;
  background-color: #141414;
  border-radius: 3px;
}

.hb-night table.table.table-inner {
  margin: -4px -20px;
  position: relative;
  background-color: #141414;
  border-radius: 3px;
}

.hb-night table.table.table-inner {
  margin: -4px -20px;
  position: relative;
  background-color: #141414;
  border-radius: 3px;
}

table.table.table-inner.action-box {
  margin: -1px -10px;
}

.merchant-top.tips-word {
  -webkit-box-flex: 2;
  -ms-flex-positive: 2;
  flex-grow: 2;
  text-align: left;
}

.rightarea.rightarea-tabs {
  border: none;
}

.order_box {
  width: 100%;
  background: #fff;
  height: 56px;
  line-height: 56px;
  margin-bottom: 20px;
  border-bottom: 2px solid #ccf2ff;
  position: relative;
  text-align: left;
}

.order_box a {
  color: #909090;
  font-size: 16px;
  padding: 0 30px;
  cursor: pointer;
  text-decoration: none;
  text-align: center;
  line-height: 54px;
  display: inline-block;
}

.order_box.active {
  border-bottom: 2px solid #00c2a8;
}

.order_box.search {
  position: absolute;
  width: 300px;
  height: 32px;
  top: 12px;
  right: 0;
  display: flex;
  /* border: #cccccc solid 1px; */
}

.ivu-btn-primary {
  background-color: #00c2a8;
  border-color: #00c2a8;
}
#pages {
  margin: 10px;
  overflow: hidden;
}
</style>
<style lang="scss">
.nav-rights {
.nav-right {
.rightarea {
.action-box {
.action-inner {
.inner-left,
.inner-box {
.ivu-select-dropdown.ivu-select-item {
              padding: 6px 16px;
            }
          }
        }
.form-group-container {
.form-group {
.input-group {
.ivu-poptip-rel {
                display: block;
.ivu-input-number {
                  width: 100%;
                }
              }
.ivu-input-number {
                width: 100%;
              }
            }
          }
        }
      }
    }
.table-inner.action-box {
.action-content.action-body {
        /* pagination */
.order-table.ivu-table-wrapper.ivu-table-header {
          thead.ivu-table-cell {
.ivu-poptip.ivu-poptip-rel.ivu-table-filter {
              i.ivu-icon.ivu-icon-funnel.on {
                color: #1ad4bc;
              }
            }
          }
        }
      }
    }
  }
}
</style>

<style scoped lang="scss">
/* B3 — desk-aligned money shell on withdraw (parity with MoneyIndex). */
.ix-money.ix-withdraw {
  padding: 12px 14px 18px;
  border: 1px solid var(--ix-border, rgba(255, 255, 255, 0.08));
  border-radius: 10px;
  background: var(--ix-surface, rgba(255, 255, 255, 0.03));
}
.ix-withdraw-nav {
  margin-bottom: 10px;
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

