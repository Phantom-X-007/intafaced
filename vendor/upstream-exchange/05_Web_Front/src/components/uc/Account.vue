<template>
    <div class="nav-rights uc_account">
        <div class="nav-right col-xs-12 col-md-10 padding-right-clear">
            <div class="bill_box rightarea padding-right-clear record account-box">
                <!-- B3 craft: desk-aligned shell — honesty paths unchanged. -->
                <div class="ix-money ix-account">
                <section class="trade-group merchant-top ix-account-head">
                    <i class="merchant-icon tips"></i>
                    <span class="tips-word">{{$t('uc.account.pagetitle')}}</span>
                    <span class="tips-g">{{$t('uc.account.pagetip')}}</span>
                </section>
                <div class="ix-card ix-account-subs">
                    <div class="ix-card-head">
                        <h2>{{ $t('uc.account.subAccountsCreate') }}</h2>
                        <span class="ix-sub">subAccounts.create</span>
                    </div>
                    <p class="ix-lead">{{ $t('uc.account.subAccountsLead') }}</p>
                    <div class="ix-field-grid">
                        <div class="ix-field">
                            <label for="ix-sa-label">{{ $t('uc.account.subAccountsLabel') }}</label>
                            <Input element-id="ix-sa-label" v-model="createLabel" :placeholder="$t('uc.account.subAccountsLabelHint')" :maxlength="64"></Input>
                        </div>
                        <div class="ix-field">
                            <label for="ix-sa-purpose">{{ $t('uc.account.subAccountsPurpose') }}</label>
                            <Input element-id="ix-sa-purpose" v-model="createPurpose" :placeholder="$t('uc.account.subAccountsPurposeHint')" :maxlength="200"></Input>
                        </div>
                    </div>
                    <div class="ix-actions">
                        <Button type="primary" :loading="createdSub.busy" :disabled="!canCreateSub" @click="createSubAccount">
                            {{ $t('uc.account.subAccountsCreate') }}
                        </Button>
                    </div>
                    <div v-if="createdSub.ran" style="margin-top:14px;">
                        <div v-if="createdSub.reason === 'ok' && createdSub.data" class="ix-done">
                            <strong>{{ $t('uc.account.subAccountsCreatedOk') }}</strong>
                            <div style="margin-top:6px;">{{ createdSub.data.id }}</div>
                        </div>
                        <IxState v-else :loading="createdSub.busy" :reason="createdSub.reason" :message="createdSub.message" endpoint="/api/identity/trpc/subAccounts.create"></IxState>
                    </div>
                </div>
                <div class="ix-card ix-account-subs">
                    <div class="ix-card-head">
                        <h2>{{ $t('uc.account.subAccountsTitle') }}</h2>
                        <span class="ix-sub">subAccounts.list</span>
                    </div>
                    <IxState :loading="subs.loading" :reason="subs.reason" :message="subs.message" endpoint="/api/identity/trpc/subAccounts.list">
                        <div v-if="listRows.length" class="ix-scroll">
                            <table class="ix-table">
                                <thead>
                                    <tr>
                                        <th>{{ $t('uc.account.subAccountsId') }}</th>
                                        <th>{{ $t('uc.account.subAccountsLabel') }}</th>
                                        <th>{{ $t('uc.account.subAccountsPurpose') }}</th>
                                        <th>{{ $t('uc.account.subAccountsStatus') }}</th>
                                        <th>{{ $t('uc.account.subAccountsCreated') }}</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="row in listRows" :key="row.id">
                                        <td>{{ row.id }}</td>
                                        <td>{{ row.label }}</td>
                                        <td>{{ row.purpose ? row.purpose : '—' }}</td>
                                        <td>{{ row.revoked ? $t('uc.account.subAccountsRevoked') : $t('uc.account.subAccountsActive') }}</td>
                                        <td>{{ row.createdAt }}</td>
                                        <td>
                                            <Button v-if="!row.revoked" size="small" :loading="revokingId === row.id" :disabled="!!revokingId" @click="revokeSubAccount(row)">
                                                {{ $t('uc.account.subAccountsRevoke') }}
                                            </Button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div v-else class="ix-note ix-note-quiet">{{ $t('uc.account.subAccountsEmpty') }}</div>
                    </IxState>
                    <div v-if="revokedSub.ran && revokedSub.reason !== 'ok'" style="margin-top:14px;">
                        <IxState :loading="revokedSub.busy" :reason="revokedSub.reason" :message="revokedSub.message" endpoint="/api/identity/trpc/subAccounts.revoke"></IxState>
                    </div>
                </div>
                <section class="accountContent">
                    <IxHonestState v-if="profileLoading" kind="loading" message="Loading payment methods…" />
                    <IxHonestState v-else-if="profileUnknown" kind="unknown" :message="profileUnknown" />
                    <IxHonestState v-else-if="profileError" kind="error" :message="profileError" />
                    <IxHonestState v-if="bindUnknown" kind="unknown" :message="bindUnknown" />
                    <p v-else-if="profileReachable" class="ix-dualbook" role="note">
                      <strong>{{ $t("shellResidual.otcMethods") }}</strong> {{ $t("shellResidual.paymentMethodsHonest") }}
                    </p>
                    <div class="account-in" v-if="profileReachable">
                        <div class="account-item">
                            <div class="account-item-in">
                                <i class="icons bankfor"></i>
                                <span class="card-number">{{$t('uc.account.backcardno')}}</span>
                                <p v-if="user.bankVerified==1" class="bankInfo" style="color: #fff;">
                                    {{user.bankInfo.cardNo}}
                                </p>
                                <p v-else class="bankInfo">
                                  {{$t('uc.account.backcardtip')}}
                                </p>
                                <a class="btn" v-if="user.bankVerified==1" @click="showItem(1)">{{$t('uc.account.modify')}}</a>
                                <a class="btn" v-else @click="showItem(1)">{{$t('uc.account.bind')}}</a>
                            </div>
                            <div class="account-detail" v-show="choseItem==1">
                                <div class="detail-list">
                                    <Form ref="formValidate1" :model="formValidate1" :rules="ruleValidate" :label-width="85">
                                        <!-- name -->
                                        <FormItem :label="$t('uc.account.name')" prop="name">
                                            <Input disabled size="large" v-model="formValidate1.name"></Input>
                                        </FormItem>
                                        <!-- bankName -->
                                        <FormItem :label="$t('uc.account.bankaccount')" prop="bankName">
                                            <Select v-model="formValidate1.bankName" size="large">
                                                <Option v-for="item in bankNameList" :value="item.value" :key="item.value">{{ item.label }}</Option>
                                            </Select>
                                        </FormItem>
                                        <!-- bankBranch -->
                                        <FormItem :label="$t('uc.account.bankbranch')" prop="bankBranch">
                                            <Input v-model="formValidate1.bankBranch" size="large"></Input>
                                        </FormItem>
                                        <!-- bankNo -->
                                        <FormItem :label="$t('uc.account.bankno')" prop="bankNo">
                                            <Input v-model="formValidate1.bankNo" size="large" type="text"></Input>
                                        </FormItem>
                                        <!-- bankNoConfirm -->
                                        <FormItem :label="$t('uc.account.confirmbankno')" prop="bankNoConfirm">
                                            <Input v-model="formValidate1.bankNoConfirm" size="large" type="text"></Input>
                                        </FormItem>
                                        <!-- passwd -->
                                        <FormItem :label="$t('uc.account.fundpwd')" prop="password">
                                            <Input v-model="formValidate1.password" type="password" size="large"></Input>
                                        </FormItem>
                                        <!-- Button -->
                                        <FormItem>
                                            <Button type="primary" @click="handleSubmit('formValidate1')">{{$t('uc.account.save')}}</Button>
                                            <!-- <Button type="ghost" @click="handleReset('formValidate1')" style="margin-left: 8px">Reset</Button> -->
                                        </FormItem>
                                    </Form>
                                </div>
                            </div>
                        </div>
                        <div class="account-item">
                            <div class="account-item-in">
                                <i class="icons alipay"></i>
                                <span class="card-number">{{$t('uc.account.zfbaccount')}}</span>
                                <p v-if="user.aliVerified==1" class="bankInfo" style="color: #fff;">
                                    {{user.alipay.aliNo}}
                                </p>
                                <p v-else class="bankInfo">
                                  {{$t('uc.account.zfbaccounttip')}}
                                </p>
                                <a class="btn" v-if="user.aliVerified==1" @click="showItem(2)">{{$t('uc.account.modify')}}</a>
                                <a class="btn" v-else @click="showItem(2)">{{$t('uc.account.bind')}}</a>
                            </div>
                            <div class="account-detail" v-show="choseItem==2">
                                <div class="detail-list">
                                    <Form ref="formValidate2" :model="formValidate2" :rules="ruleValidate" :label-width="95">
                                      <Row>
                                        <Col span="8">
                                        <input type="hidden" name="aliPreview" :value="aliPreview" />
                                        <img v-if="aliImg" :alt="$t('uc.account.imgtip')" style="width: 200px;height: 200px;" :src="aliImg">
                                        <img v-else :alt="$t('uc.account.imgtip')" style="width: 200px;height: 200px;" src="../../assets/images/upload_placeholder.png">
                                        <div class="acc_sc">
                                          <Upload ref="upload1" :on-success="aliHandleSuccess" :headers="uploadHeaders" :action="uploadUrl">
                                            <Button icon="ios-cloud-upload-outline">{{$t('uc.safe.upload')}}</Button>
                                          </Upload>
                                        </div>
                                        </Col>

                                        <Col span="16">
                                        <!-- name -->
                                        <FormItem :label="$t('uc.account.name')" prop="name">
                                            <Input disabled size="large" v-model="formValidate2.name"></Input>
                                        </FormItem>
                                        <!-- alipay -->
                                        <FormItem :label="$t('uc.account.zfbaccount')" prop="alipay">
                                            <Input v-model="formValidate2.alipay" size="large"></Input>
                                        </FormItem>
                                        <!-- passwd -->
                                        <FormItem :label="$t('uc.account.fundpwd')" prop="password">
                                            <Input v-model="formValidate2.password" type="password" size="large"></Input>
                                        </FormItem>
                                        <!-- Button -->
                                        <FormItem>
                                          <Button type="primary" @click="handleSubmit('formValidate2')">{{$t('uc.account.save')}}</Button>
                                          <!-- <Button type="ghost" @click="handleReset('formValidate2')" style="margin-left: 8px">Reset</Button> -->
                                        </FormItem>
                                        </Col>

                                      </Row>

                                    </Form>
                                </div>
                            </div>
                        </div>
                        <div class="account-item">
                            <div class="account-item-in">
                                <i class="icons wechat"></i>
                                <span class="card-number">{{$t('uc.account.wxaccount')}}</span>
                                <p v-if="user.wechatVerified==1" class="bankInfo" style="color: #fff;">
                                    {{user.wechatPay.wechat}}
                                </p>
                                <p v-else class="bankInfo">
                                  {{$t('uc.account.wxaccounttip')}}
                                </p>
                                <a class="btn" v-if="user.wechatVerified==1" @click="showItem(3)">{{$t('uc.account.modify')}}</a>
                                <a class="btn" v-else @click="showItem(3)">{{$t('uc.account.bind')}}</a>
                            </div>
                            <div class="account-detail" v-show="choseItem==3">
                                <div class="detail-list">
                                    <Form ref="formValidate3" :model="formValidate3" :rules="ruleValidate" :label-width="85">
                                      <Row>
                                        <Col span="8">
                                          <input type="hidden" name="wePreview" :value="wePreview" />
                                          <img v-if="weImg" :alt="$t('uc.account.imgtip')" style="width: 200px;height: 200px;" :src="weImg" >
                                          <img v-else :alt="$t('uc.account.imgtip')" style="width: 200px;height: 200px;" src="../../assets/images/upload_placeholder.png">
                                          <div class="acc_sc">
                                            <Upload ref="upload2" :on-success="weHandleSuccess" :headers="uploadHeaders" :action="uploadUrl">
                                              <Button icon="ios-cloud-upload-outline">{{$t('uc.safe.upload')}}</Button>
                                            </Upload>
                                          </div>
                                        </Col>
                                        <Col span="16">
                                        <!-- name -->
                                        <FormItem :label="$t('uc.account.name')" prop="name">
                                            <Input disabled size="large" v-model="formValidate3.name"></Input>
                                        </FormItem>
                                        <!-- wechat -->
                                        <FormItem :label="$t('uc.account.wxaccount')" prop="wechat">
                                            <Input v-model="formValidate3.wechat" size="large"></Input>
                                        </FormItem>
                                        <!-- passwd -->
                                        <FormItem :label="$t('uc.account.fundpwd')" prop="password">
                                            <Input v-model="formValidate3.password" type="password" size="large"></Input>
                                        </FormItem>
                                        <!-- Button -->
                                        <FormItem>
                                            <Button type="primary" @click="handleSubmit('formValidate3')">{{$t('uc.account.save')}}</Button>
                                            <!-- <Button type="ghost" @click="handleReset('formValidate3')" style="margin-left: 8px">Reset</Button> -->
                                        </FormItem>
                                        </Col>
                                      </Row>
                                    </Form>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
                </div><!-- /.ix-money.ix-account -->
            </div>
        </div>
    </div>
</template>
<script>

import IxHonestState from './IxHonestState.vue';
import IxState from '../intafaced/IxState.vue';
import { query, mutate } from '../../config/intafaced.js';
import ixModule from '../intafaced/module-mixin.js';

export default {
    mixins: [ixModule],
    components: {
      IxHonestState,
      IxState
    },
    data() {
        const validatePass = (rule, value, callback) => {
            if (value === '') {
                callback(new Error(this.$t('uc.account.banknomsg1')));
            // } else if (!/([a-zA-Z0-9]){6,18}/.test(value)) {
            } else if (!/([0-9]){6,18}/.test(value)) {
                callback(new Error(this.$t('uc.account.banknomsg1')));
            } else {
                callback();
            }
        };
        const validatePassCheck = (rule, value, callback) => {
            if (value === '') {
                callback(new Error(this.$t('uc.account.banknomsg1')));
            // } else if (!/([a-zA-Z0-9]){6,18}/.test(value)) {
            } else if (!/([0-9]){6,18}/.test(value)) {
                callback(new Error(this.$t('uc.account.banknomsg1')));
            } else if (value!== this.formValidate1.bankNo) {
                callback(new Error(this.$t('uc.account.banknomsg2')));
            } else {
                callback();
            }
        };
        return {
            subs: this.emptySection(),
            createdSub: this.emptyAction(),
            revokedSub: this.emptyAction(),
            revokingId: '',
            createLabel: '',
            createPurpose: '',
            uploadUrl:this.host+'/uc/upload/oss/image',
            aliImg:'',
            aliPreview:'',
            weImg:'',
            wePreview:'',
            isNoName: true,
            msg: '',
            choseItem: 0,
            user: {},
            profileLoading: true,
            profileReachable: false,
            profileError: '',
            /** Read timeout/transport death — unknown, not unbound. */
            profileUnknown: '',
            /** Double-submit lock for bank/ali/wechat bind (money-adjacent). */
            bindSubmitting: false,
            /** Timeout/transport death is unknown, not save_failure. Stays until getAccount succeeds. */
            bindUnknown: '',
            formValidate1: {
                name: '',
                password: '',
                bankName: '',
                bankBranch: '',
                bankNo: '',
                bankNoConfirm: '',

            },
            formValidate2: {
                name: '',
                alipay: '',
                password: '',
            },
            formValidate3: {
                name: '',
                wechat: '',
                password: '',
            },
            bankNameList: [
                {
                    value: 'ICBC',
                    label: 'ICBC'
                },
                {
                    value: 'Agricultural Bank of China',
                    label: 'Agricultural Bank of China'
                },
                {
                    value: 'China Construction Bank',
                    label: 'China Construction Bank'
                },
                {
                    value: 'Postal Savings Bank of China',
                    label: 'Postal Savings Bank of China'
                },
                {
                    value: 'China Merchants Bank',
                    label: 'China Merchants Bank'
                },
                {
                    value: 'Bank of China',
                    label: 'Bank of China'
                },
                {
                    value: 'Bank of Communications',
                    label: 'Bank of Communications'
                },
                {
                    value: 'CITIC Bank',
                    label: 'CITIC Bank'
                },
                {
                    value: 'Hua Xia Bank',
                    label: 'Hua Xia Bank'
                },
                {
                    value: 'China Minsheng Bank',
                    label: 'China Minsheng Bank'
                },
                {
                    value: 'China Guangfa Bank',
                    label: 'China Guangfa Bank'
                },
                {
                    value: 'Ping An Bank',
                    label: 'Ping An Bank'
                },
                {
                    value: 'Industrial Bank',
                    label: 'Industrial Bank'
                },
                {
                    value: 'Shanghai Pudong Development Bank',
                    label: 'Shanghai Pudong Development Bank'
                },
                {
                    value: 'China Zheshang Bank',
                    label: 'China Zheshang Bank'
                },
                {
                    value: 'Bank of Bohai',
                    label: 'Bank of Bohai'
                },
                {
                    value: 'Hengfeng Bank',
                    label: 'Hengfeng Bank'
                },
                {
                    value: 'Citibank',
                    label: 'Citibank'
                },
                {
                    value: 'Standard Chartered',
                    label: 'Standard Chartered'
                },
                {
                    value: 'HSBC',
                    label: 'HSBC'
                },
                {
                    value: 'China Everbright Bank',
                    label: 'China Everbright Bank'
                },
                {
                    value: 'Bank of Shanghai',
                    label: 'Bank of Shanghai'
                },
                {
                    value: 'Bank of Jiangsu',
                    label: 'Bank of Jiangsu'
                },
                {
                    value: 'Bank of Chongqing',
                    label: 'Bank of Chongqing'
                },
                {
                    value: 'Bank of Tianjin',
                    label: 'Bank of Tianjin'
                },
                {
                    value: 'Bank of Xiamen',
                    label: 'Bank of Xiamen'
                },
                {
                    value: 'City Commercial Bank',
                    label: 'City Commercial Bank'
                },
                {
                    value: 'Rural Commercial Bank',
                    label: 'Rural Commercial Bank'
                },
                {
                    value: 'Huishang Bank',
                    label: 'Huishang Bank'
                },



            ],
            ruleValidate: {
                name: [
                    { required: true, message: this.$t('uc.account.verifiedmsg'), trigger: 'blur' }
                ],
                bankName: [
                    { required: true, message: this.$t('uc.account.bankaccountmsg'), trigger: 'change' }
                ],
                bankBranch: [
                    { required: true, message: this.$t('uc.account.bankbranchmsg'), trigger: 'blur' }
                ],
                bankNo: [
                    { required: true, type: 'string', min: 6, message: this.$t('uc.account.banknomsg1'), trigger: 'blur' },
                    { validator: validatePass, trigger: 'blur' },
                ],
                bankNoConfirm: [
                    { required: true, type: 'string', min: 6, message: this.$t('uc.account.banknomsg2'), trigger: 'blur' },
                    { validator: validatePassCheck, trigger: 'blur' },
                ],
                password: [
                    { required: true, message: this.$t('uc.account.fundpwdmsg1'), trigger: 'blur' },
                    { min: 6, message: this.$t('uc.account.fundpwdmsg2'), trigger: 'blur' }
                ],
                alipay: [
                    { required: true, message: this.$t('uc.account.zfbaccountmsg'), trigger: 'blur' }
                ],
                wechat: [
                    { required: true, message: this.$t('uc.account.wxaccountmsg'), trigger: 'blur' }
                ],
            },

        }
    },
    methods: {
        loadSubs() {
            this.load('subs', query('identity', 'subAccounts.list', undefined, this.ixToken));
        },
        createSubAccount() {
            var self = this;
            var label = (this.createLabel || '').trim();
            if (!label || this.createdSub.busy) return;
            var body = { label: label };
            var purpose = (this.createPurpose || '').trim();
            if (purpose) body.purpose = purpose;
            this.act('createdSub', mutate('identity', 'subAccounts.create', body, this.ixToken)).then(function (res) {
                if (res && res.ok) {
                    self.createLabel = '';
                    self.createPurpose = '';
                    self.loadSubs();
                }
            });
        },
        revokeSubAccount(row) {
            var self = this;
            if (!row || !row.id || row.revoked || this.revokingId) return;
            this.revokingId = row.id;
            this.act('revokedSub', mutate('identity', 'subAccounts.revoke', { subAccountId: row.id }, this.ixToken)).then(function (res) {
                self.revokingId = '';
                if (res && res.ok) self.loadSubs();
            });
        },
        aliHandleSuccess (res, file,fileList) {
            // console.log(res);
          this.$refs.upload1.fileList=[fileList[fileList.length-1]];
          this.aliImg=this.aliPreview=res.data;
        },
        weHandleSuccess (res, file,fileList) {
          this.$refs.upload2.fileList=[fileList[fileList.length-1]];
          this.weImg=this.wePreview=res.data;
        },
        handleSubmit(name) {
            this.$refs[name].validate((valid) => {
                if (valid) {
                    this.submit(name)
                } else {
                    this.$Message.error(this.$t('uc.account.save_failure'));
                }
            })
        },
        handleReset(name) {
            this.$refs[name].resetFields();
        },
        /**
         * Money-adjacent bind/update — never silent-fail network death, never double-post.
         * Timeout/transport death is unknown until /uc/approve/* reconciles.
         * save_failure is only for an explicit service reject (code != 0).
         * Writes stay on vue-resource so 4000/3000 still hit the shared refusal interceptor.
         */
        postBind(url, param) {
            if (this.bindSubmitting || this.bindUnknown) return;
            this.bindSubmitting = true;
            const done = () => {
              this.bindSubmitting = false;
            };
            return this.$http
              .post(this.host + url, param)
              .then(response => {
                var resp = response.body;
                if (resp && resp.code == 0) {
                  this.$Message.success(this.$t('uc.account.save_success'));
                  this.getAccount();
                  this.choseItem = 0;
                } else {
                  this.$Message.error((resp && resp.message) || this.$t('uc.account.save_failure'));
                }
                done();
              })
              .catch((response) => {
                var status = response && response.status;
                var body = response && response.body;
                var code = body && body.code != null ? String(body.code) : '';
                done();
                if (status === 401 || status === 403 || code === '4000' || code === '3000') {
                  return;
                }
                this.bindUnknown =
                  'Bind did not confirm — outcome is unknown, not failed. Do not retry until you reconcile.';
                this.getAccount();
              });
        },
        submit(name) {
            if (this.bindSubmitting || this.bindUnknown) return;
            //Bank card
            if (name == 'formValidate1') {
                let param = {}
                param['bank'] = this.formValidate1.bankName
                param['branch'] = this.formValidate1.bankBranch
                param['jyPassword'] = this.formValidate1.password
                param['realName'] = this.formValidate1.name
                param['cardNo'] = this.formValidate1.bankNo
              if (this.user.bankVerified==1) {
                this.postBind('/uc/approve/update/bank', param);
              }else {
                this.postBind('/uc/approve/bind/bank', param);
              }
            }
            //Alipay
            if (name == 'formValidate2') {
                let param = {}
                param['ali'] = this.formValidate2.alipay
                param['jyPassword'] = this.formValidate2.password
                param['realName'] = this.formValidate2.name
                param['qrCodeUrl'] = this.aliPreview;

                if (this.user.aliVerified==1){
                  this.postBind('/uc/approve/update/ali', param);
                }else {
                  this.postBind('/uc/approve/bind/ali', param);
                }
            }
            if (name == 'formValidate3') {
                let param = {}
                param['wechat'] = this.formValidate3.wechat
                param['jyPassword'] = this.formValidate3.password
                param['realName'] = this.formValidate3.name
                param['qrCodeUrl'] = this.wePreview;

              if(this.user.wechatVerified==1) {
                this.postBind('/uc/approve/update/wechat', param);
              }else{
                this.postBind('/uc/approve/bind/wechat', param);
              }
            }
        },
        showItem(index) {
            this.choseItem = index;
        },
        noName() {
            this.$Message.error(this.msg);
        },
        getAccount() {
            this.profileLoading = true;
            this.profileReachable = false;
            this.profileError = '';
            this.profileUnknown = '';
            return this.$http.post(this.host + '/uc/approve/account/setting').then(response => {
                var resp = response.body;
                if (resp && resp.code == 0) {
                    this.user = resp.data || {};
                    this.formValidate1.name = this.formValidate2.name = this.formValidate3.name = this.user.realName
                    this.isNoName = false
                    this.formValidate1.bankName = this.user.bankInfo == null? '': this.user.bankInfo.bank
                    this.formValidate1.bankBranch = this.user.bankInfo == null? '': this.user.bankInfo.branch
                    this.formValidate1.bankNo = this.user.bankInfo == null? '': this.user.bankInfo.cardNo
                    this.formValidate2.alipay = this.user.alipay == null? '': this.user.alipay.aliNo
                    this.formValidate3.wechat = this.user.wechatPay == null? '': this.user.wechatPay.wechat
                    this.aliImg = this.aliPreview = this.user.alipay == null? '': this.user.alipay.qrCodeUrl;
                    this.weImg = this.wePreview = this.user.wechatPay == null? '': this.user.wechatPay.qrWeCodeUrl;
                    this.profileReachable = true;
                    this.profileLoading = false;
                    this.bindUnknown = '';
                } else {
                    this.msg = (resp && resp.message) || '';
                    this.profileError =
                      "Payment methods did not answer — bind status is unknown, not unbound.";
                    this.profileLoading = false;
                    if (resp && resp.message) {
                      this.$Notice.error({
                        title: this.$t("common.tip"),
                        desc: resp.message
                      });
                    }
                    // Do not force-route to /uc/safe on unknown — that hides the honesty state.
                }
            }).catch(() => {
                this.profileUnknown =
                  "Payment methods service did not respond — bind status is unknown, not unbound.";
                this.profileLoading = false;
            })
        }

    },
    created() {
        this.getAccount();
        this.loadSubs();
    },
    watch: {
        ixToken() {
            this.loadSubs();
        }
    },
    computed: {
        uploadHeaders() {
            // The upload widget does not get a private legacy auth channel.
            // Its credential is projected from the sole in-memory session.
            return this.ixToken ? { 'x-auth-token': this.ixToken } : {};
        },
        listRows() {
            var d = this.subs && this.subs.data;
            if (!Array.isArray(d)) return [];
            return d.filter(function (row) { return row && row.id; });
        },
        canCreateSub() {
            return !!(this.ixToken && !this.createdSub.busy && (this.createLabel || '').trim());
        }
    }
}
</script>
<style scoped>
.account-box.account-in.account-item.account-detail {
    padding: 30px 0;
    /* background: white; */
    margin: 6px 0;
}

.account-box.account-in.account-item.account-detail.detail-list {
    width: 40%;
    width: 80%;
    margin: 0 auto;
}

.account-box.account-in.account-item.account-detail.detail-list.input-control {
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

.account-box.account-in.account-item.account-item-in.bankfor {
    background-image: url(../../assets/img/bankcard.png);
}

.icons.alipay {
    background-image: url(../../assets/img/alipay.png);
}

.icons.wechat {
    background-image: url(../../assets/img/wechat.png);
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
    width:70%;
    text-align: left;
    color: rgb(130, 142, 161);
    font-size: 13px;
}

.account-box.account-in.account-item.account-item-in.btn {
    padding: 8px 10px;
    cursor: pointer;
    color: #c8c8c8;
}

.tips-g {
    color: rgb(130, 142, 161);
    font-size: 12px;
}

.table-inner {
    position: relative;
    text-align: left;
    border-radius: 3px;
    padding: 23px 20px 20px;
}

.acb-p1 {
    font-size: 18px;
    font-weight: 600;
    line-height: 50px;
}

.acb-p2 {
    font-size: 14px;
    line-height: 24px;
}

.action-inner {
    width: 100%;
    display: table;
}

.action-inner.inner-box {
    display: table-cell;
    width: 100%;
}

.action-box.title.copy {
    user-select: text;
}

.action-box.title a.link-copy {
    font-size: 14px;
    margin-left: 20px;
}

.hb-night a {
    text-decoration: none;
    color: #c8c8c8;
    transition: all.2s ease-in-out;
    cursor: pointer;
}

.action-box.title a.link-qrcode {
    margin-left: 20px;
    font-size: 14px;
    position: relative;
}

.hb-night a {
    text-decoration: none;
    color: #c8c8c8;
    transition: all.2s ease-in-out;
    cursor: pointer;
}

.action-box.subtitle {
    font-size: 12px;
    margin-top: 30px;
}

.action-content {
    width: 100%;
    margin-top: 30px;
    overflow: hidden;
    display: table;
}

.action-box.title {
    margin-top: 20px;
    font-size: 20px;
    user-select: none;
}

.action-box.title.show-qrcode {
    position: absolute;
    top: -100px;
    left: 40px;
    padding: 10px;
}

.action-inner.inner-box.deposit-address {
    width: 80%;
}

p.describe {
    font-size: 16px;
    font-weight: 600;
}

.merchant-top {
    height: 50px;
    display: -webkit-box;
    display: -ms-flexbox;
    display: flex;
    -webkit-box-align: center;
    -ms-flex-align: center;
    align-items: center;
    padding: 0 15px;
}

.trade-group {
    margin-bottom: 20px;
    font-size: 14px;
}

.merchant-icon {
    display: inline-block;
    margin-left: 4px;
    background-size: 100% 100%;
}

.merchant-top.tips-word {
    -webkit-box-flex: 2;
    -ms-flex-positive: 2;
    flex-grow: 2;
    text-align: left;
}

.merchant-icon.tips {
    width: 4px;
    height: 22px;
    margin-right: 10px;
    background: #c8c8c8;
}

.bill_box {
    width: 100%;
    height: auto;
    overflow: hidden;
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

.rightarea.rightarea-con {
    padding-top: 30px;
    padding-bottom: 125px;
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
    background: #080808;
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
    border-left: 5px solid #080808;
}

.rightarea.rightarea-tabs {
    border: none;
}

.rightarea.rightarea-tabs li>a {
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

.rightarea.rightarea-tabs li>a:hover {
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

.rightarea.rightarea-tabs li.active>a,
.rightarea.rightarea-tabs li:hover>a {
    color: #da2e22;
    border: none;
}

.rightarea.panel-tips {
    border: 3px solid #080808;
    color: #9e9e9e;
    font-size: 12px;
}

.rightarea.panel-tips.panel-header {
    background: #080808;
    line-height: 40px;
    margin-bottom: 15px;
}

.rightarea.panel-tips.panel-title {
    font-size: 16px;
}

.rightarea.recordtitle {
    cursor: pointer;
}

.nav-right {
    /* width: 1000px; */
    height: auto;
    overflow: hidden;
    padding: 0 15px;
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
    border-bottom: 2px solid #c8c8c8;
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
.ivu-btn-primary{
    background-color: #c8c8c8;
    border-color: #c8c8c8;
}

@media screen and (max-width:768px){
.uc_account.nav-right{
        padding: 0 0!important;
    }
.uc_account.account-box.account-in.account-item.account-item-in.card-number{
        padding: 0px 5px!important;
    }
.uc_account.merchant-top{
        padding: 0 0!important;
    }
}

</style>

<style scoped lang="scss">
/* B3 — Account OTC methods share money/desk shell. */
.ix-money.ix-account {
  padding: 12px 14px 18px;
  border: 1px solid var(--ix-border, rgba(255, 255, 255, 0.08));
  border-radius: 10px;
  background: var(--ix-surface, rgba(255, 255, 255, 0.03));
}
.ix-account-head {
  margin-bottom: 10px;
}
.ix-dualbook {
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid rgba(200, 200, 200, 0.35);
  border-radius: 6px;
  background: rgba(200, 200, 200, 0.06);
  color: #c8cdd4;
  font-size: 12.5px;
  line-height: 1.5;
}
.ix-dualbook strong {
  color: #c8c8c8;
  font-weight: 600;
}
.ix-account-subs {
  margin: 0 0 16px;
}
</style>
