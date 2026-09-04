<template>
  <div class="ix-page bank-page p2p-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.p2p.title') }}</h1>
      <p>{{ $t('intafaced.modules.p2p.blurb') }}</p>
      <details class="bank-details"><summary>Details</summary><code>svc-p2p · /api/p2p/trpc</code></details>
    </div>

    <nav class="p2p-jump-nav" aria-label="P2P workspace">
      <a href="#p2p-offers">Offers</a>
      <a href="#p2p-trades">Trades</a>
      <a href="#p2p-create">Create</a>
      <a href="#p2p-instruments">Payment methods</a>
      <a href="#p2p-merchant">Merchant</a>
      <a href="#p2p-fiat">Fiat reference</a>
    </nav>

    <div class="ix-note ix-note-quiet" style="margin-bottom:20px;">
      {{ $t('intafaced.modules.p2p.note') }}
    </div>
    <div id="ix-p2p-rfq-refuse" class="ix-note ix-note-quiet" style="margin-bottom:20px;" role="status">
      {{ $t('intafaced.modules.p2p.rfqRefuse') }}
    </div>

    <div id="p2p-merchant" class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.p2p.merchantApply') }}</h2>
        <span class="ix-sub">merchants.me · merchants.apiAccess · merchants.submitApplication · merchants.withdraw</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.p2p.merchantApplyLead') }}</p>
      <IxState compact :loading="merchant.loading" :reason="merchant.reason" :message="merchant.message" endpoint="/api/p2p/trpc/merchants.me">
        <div v-if="merchant.data" class="ix-kv" style="margin-bottom:16px;">
          <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.merchantApplyUser') }}</span><span class="v">{{ merchant.data.userId }}</span></div>
          <div class="ix-kv-item"><span class="k">{{ $t('intafaced.bank.status') }}</span><span class="v">{{ merchant.data.status }}</span></div>
          <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.merchantApplyTrades') }}</span><span class="v">{{ merchant.data.appliedTradesTotal }}</span></div>
          <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.merchantApplyCompletion') }}</span><span class="v">{{ merchant.data.appliedCompletionRate }}</span></div>
          <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.merchantApplyAppliedAt') }}</span><span class="v">{{ merchant.data.appliedAt }}</span></div>
          <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.merchantApplyDecidedAt') }}</span><span class="v">{{ merchant.data.decidedAt === null ? '—' : merchant.data.decidedAt }}</span></div>
        </div>
        <div v-else class="ix-note ix-note-quiet" style="margin-bottom:16px;">{{ $t('intafaced.p2p.merchantApplyNever') }}</div>
      </IxState>
      <IxState compact :loading="apiAccess.loading" :reason="apiAccess.reason" :message="apiAccess.message" endpoint="/api/p2p/trpc/merchants.apiAccess">
        <div v-if="apiAccess.data" class="ix-kv" style="margin-bottom:16px;">
          <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.merchantApplyEligible') }}</span><span class="v">{{ apiAccess.data.eligible }}</span></div>
          <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.merchantApplyCredential') }}</span><span class="v">{{ apiAccess.data.credential }}</span></div>
          <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.merchantApplyApiStatus') }}</span><span class="v">{{ apiAccess.data.merchantStatus === null ? '—' : apiAccess.data.merchantStatus }}</span></div>
          <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.merchantApplyKeyPlane') }}</span><span class="v">{{ apiAccess.data.keyPlane }}</span></div>
          <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.merchantApplyRateLimit') }}</span><span class="v">{{ apiAccess.data.rateLimitPlane }}</span></div>
          <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.merchantApplyDispute') }}</span><span class="v">{{ apiAccess.data.disputeResolution }}</span></div>
        </div>
      </IxState>
      <div class="ix-actions" style="margin-bottom:16px;">
        <Button
          v-if="ixToken && !hasLiveMerchantStanding"
          size="small"
          :loading="merchantApply.busy"
          :disabled="!canApply"
          @click="submitMerchantApplication"
        >{{ $t('intafaced.p2p.merchants.submit') }}</Button>
        <router-link v-else-if="!ixToken" to="/platform">{{ $t('intafaced.p2p.merchantApplySignIn') }}</router-link>
      </div>
      <IxState compact v-if="merchantApply.ran" :loading="merchantApply.busy" :reason="merchantApply.reason" :message="merchantApply.message" endpoint="/api/p2p/trpc/merchants.submitApplication">
        <div v-if="merchantApply.data" class="ix-done">
          <strong>{{ $t('intafaced.p2p.merchants.submitDone') }}</strong>
          <div class="ix-kv" style="margin-top:8px;">
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.merchantApplyUser') }}</span><span class="v">{{ merchantApply.data.userId }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.bank.status') }}</span><span class="v">{{ merchantApply.data.status }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.merchantApplyAppliedAt') }}</span><span class="v">{{ merchantApply.data.appliedAt }}</span></div>
          </div>
        </div>
      </IxState>
      <div v-if="ixToken && hasLiveMerchantStanding">
        <div class="ix-form-row" style="margin-bottom:16px;">
          <div class="ix-field">
            <label for="ix-p2p-merchant-reason">{{ $t('intafaced.p2p.merchants.withdrawReason') }}</label>
            <Input element-id="ix-p2p-merchant-reason" v-model="withdrawReason" :placeholder="$t('intafaced.p2p.merchants.withdrawReasonHint')" />
          </div>
        </div>
        <div class="ix-actions" style="margin-bottom:16px;">
          <Button
            size="small"
            :loading="merchantWithdraw.busy"
            :disabled="!canWithdraw"
            @click="withdrawMerchant"
          >{{ $t('intafaced.p2p.merchants.withdraw') }}</Button>
        </div>
      </div>
      <IxState compact v-if="merchantWithdraw.ran" :loading="merchantWithdraw.busy" :reason="merchantWithdraw.reason" :message="merchantWithdraw.message" endpoint="/api/p2p/trpc/merchants.withdraw">
        <div v-if="merchantWithdraw.data" class="ix-done">
          <strong>{{ $t('intafaced.p2p.merchants.withdrawDone') }}</strong>
          <div class="ix-kv" style="margin-top:8px;">
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.merchantApplyUser') }}</span><span class="v">{{ merchantWithdraw.data.userId }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.bank.status') }}</span><span class="v">{{ merchantWithdraw.data.status }}</span></div>
          </div>
        </div>
      </IxState>
    </div>

    <div id="p2p-create" class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.p2p.createOffer') }}</h2>
        <span class="ix-sub">offers.create</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.p2p.createOfferLead') }}</p>
      <div class="ix-form-row" style="margin-bottom:16px;">
        <div class="ix-field">
          <label for="ix-p2p-create-side">{{ $t('intafaced.p2p.side') }}</label>
          <select id="ix-p2p-create-side" v-model="createForm.side">
            <option value="sell">sell</option>
            <option value="buy">buy</option>
          </select>
        </div>
        <div class="ix-field">
          <label for="ix-p2p-create-asset">{{ $t('intafaced.p2p.createOfferAsset') }}</label>
          <Input element-id="ix-p2p-create-asset" v-model="createForm.asset" :placeholder="$t('intafaced.p2p.createOfferAssetHint')" />
        </div>
        <div class="ix-field">
          <label for="ix-p2p-create-fiat">{{ $t('intafaced.p2p.createOfferFiat') }}</label>
          <Input element-id="ix-p2p-create-fiat" v-model="createForm.fiatCurrency" :placeholder="$t('intafaced.p2p.createOfferFiatHint')" />
        </div>
        <div class="ix-field">
          <label for="ix-p2p-create-price-type">{{ $t('intafaced.p2p.createOfferPriceType') }}</label>
          <select id="ix-p2p-create-price-type" v-model="createForm.priceType">
            <option value="fixed">fixed</option>
            <option value="float">float</option>
          </select>
        </div>
      </div>
      <div class="ix-form-row" style="margin-bottom:16px;">
        <div class="ix-field">
          <label for="ix-p2p-create-price">{{ $t('intafaced.p2p.price') }}</label>
          <Input element-id="ix-p2p-create-price" v-model="createForm.price" :placeholder="$t('intafaced.p2p.take.amountHint')" />
        </div>
        <div class="ix-field">
          <label for="ix-p2p-create-min">{{ $t('intafaced.p2p.createOfferMin') }}</label>
          <Input element-id="ix-p2p-create-min" v-model="createForm.minAmount" :placeholder="$t('intafaced.p2p.take.amountHint')" />
        </div>
        <div class="ix-field">
          <label for="ix-p2p-create-max">{{ $t('intafaced.p2p.createOfferMax') }}</label>
          <Input element-id="ix-p2p-create-max" v-model="createForm.maxAmount" :placeholder="$t('intafaced.p2p.take.amountHint')" />
        </div>
        <div class="ix-field">
          <label for="ix-p2p-create-total">{{ $t('intafaced.p2p.createOfferTotal') }}</label>
          <Input element-id="ix-p2p-create-total" v-model="createForm.totalAmount" :placeholder="$t('intafaced.p2p.createOfferTotalHint')" />
        </div>
      </div>
      <div class="ix-form-row" style="margin-bottom:16px;">
        <div class="ix-field">
          <label for="ix-p2p-create-methods">{{ $t('intafaced.p2p.createOfferMethods') }}</label>
          <Input element-id="ix-p2p-create-methods" v-model="createForm.methods" :placeholder="$t('intafaced.p2p.createOfferMethodsHint')" />
        </div>
        <div class="ix-field">
          <label for="ix-p2p-create-terms">{{ $t('intafaced.p2p.createOfferTerms') }}</label>
          <Input element-id="ix-p2p-create-terms" v-model="createForm.terms" :placeholder="$t('intafaced.p2p.createOfferTermsHint')" />
        </div>
      </div>
      <div class="ix-actions" style="margin-bottom:16px;">
        <Button
          v-if="ixToken"
          size="small"
          :loading="create.busy"
          :disabled="!canCreate"
          @click="createOffer"
        >{{ $t('intafaced.p2p.createOfferSubmit') }}</Button>
        <router-link v-else to="/platform">{{ $t('intafaced.p2p.createOfferSignIn') }}</router-link>
      </div>
      <IxState compact v-if="create.ran" :loading="create.busy" :reason="create.reason" :message="create.message" endpoint="/api/p2p/trpc/offers.create">
        <div v-if="create.data" class="ix-done">
          <strong>{{ $t('intafaced.p2p.createOfferDone') }}</strong>
          <div class="ix-kv" style="margin-top:8px;">
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.createOfferId') }}</span><span class="v">{{ create.data.id }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.side') }}</span><span class="v">{{ create.data.side }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.createOfferAsset') }}</span><span class="v">{{ create.data.asset }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.price') }}</span><span class="v">{{ create.data.price }} {{ create.data.fiatCurrency }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.bank.status') }}</span><span class="v">{{ create.data.status }}</span></div>
          </div>
        </div>
      </IxState>
    </div>

    <div id="p2p-instruments" class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.p2p.instrument') }}</h2>
        <span class="ix-sub">instruments.create · instruments.list · instruments.remove</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.p2p.instrumentLead') }}</p>
      <IxState compact :loading="methods.loading" :reason="methods.reason" :message="methods.message" endpoint="/api/p2p/trpc/instruments.methods.list">
        <div v-if="registryEmpty" class="ix-note" style="margin-bottom:16px;">{{ $t('intafaced.p2p.take.noMethodRegistry') }}</div>
      </IxState>
      <div class="ix-form-row" style="margin-bottom:16px;">
        <div class="ix-field">
          <label for="ix-p2p-inst-method">{{ $t('intafaced.p2p.instrumentMethod') }}</label>
          <select v-if="methods.data && methods.data.length" id="ix-p2p-inst-method" v-model="instrumentMethodChoice">
            <option value="">{{ $t('intafaced.p2p.instrumentMethodHint') }}</option>
            <option v-for="m in methods.data" :key="m.methodId + '-' + m.country" :value="m.methodId + '|' + m.country">{{ m.label }} · {{ m.methodId }} · {{ m.country }}</option>
          </select>
          <Input v-else element-id="ix-p2p-inst-method" v-model="instrumentForm.methodId" :placeholder="$t('intafaced.p2p.instrumentMethodHint')" />
        </div>
        <div class="ix-field">
          <label for="ix-p2p-inst-country">{{ $t('intafaced.p2p.instrumentCountry') }}</label>
          <Input element-id="ix-p2p-inst-country" v-model="instrumentForm.country" :placeholder="$t('intafaced.p2p.instrumentCountryHint')" />
        </div>
        <div class="ix-field">
          <label for="ix-p2p-inst-fiat">{{ $t('intafaced.p2p.instrumentFiat') }}</label>
          <Input element-id="ix-p2p-inst-fiat" v-model="instrumentForm.fiatCurrency" :placeholder="$t('intafaced.p2p.instrumentFiatHint')" />
        </div>
        <div class="ix-field">
          <label for="ix-p2p-inst-label">{{ $t('intafaced.p2p.instrumentLabel') }}</label>
          <Input element-id="ix-p2p-inst-label" v-model="instrumentForm.label" :placeholder="$t('intafaced.p2p.instrumentLabelHint')" />
        </div>
      </div>
      <div v-if="instrumentDetailFields.length" class="ix-form-row" style="margin-bottom:16px;">
        <div v-for="field in instrumentDetailFields" :key="field.key" class="ix-field">
          <label :for="'ix-p2p-inst-d-' + field.key">{{ field.label }}</label>
          <Input
            :element-id="'ix-p2p-inst-d-' + field.key"
            v-model="instrumentForm.details[field.key]"
            :type="field.sensitive ? 'password' : 'text'"
            :placeholder="field.help || ''"
          />
        </div>
      </div>
      <div class="ix-actions" style="margin-bottom:16px;">
        <Button
          v-if="ixToken"
          size="small"
          :loading="instrumentSave.busy"
          :disabled="!canSaveInstrument"
          @click="saveInstrument"
        >{{ $t('intafaced.p2p.instruments.create') }}</Button>
        <router-link v-else to="/platform">{{ $t('intafaced.p2p.instrumentSignIn') }}</router-link>
      </div>
      <IxState compact v-if="instrumentSave.ran" :loading="instrumentSave.busy" :reason="instrumentSave.reason" :message="instrumentSave.message" endpoint="/api/p2p/trpc/instruments.create">
        <div v-if="instrumentSave.data" class="ix-done">
          <strong>{{ $t('intafaced.p2p.instrumentDone') }}</strong>
          <div class="ix-kv" style="margin-top:8px;">
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.instrumentId') }}</span><span class="v">{{ instrumentSave.data.id }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.instrumentMethod') }}</span><span class="v">{{ instrumentSave.data.methodId }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.instrumentCountry') }}</span><span class="v">{{ instrumentSave.data.country }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.instrumentFiat') }}</span><span class="v">{{ instrumentSave.data.fiatCurrency }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.instrumentLabel') }}</span><span class="v">{{ instrumentSave.data.label }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.bank.status') }}</span><span class="v">{{ instrumentSave.data.status }}</span></div>
          </div>
        </div>
      </IxState>
      <IxState compact :loading="instruments.loading" :reason="instruments.reason" :message="instruments.message" endpoint="/api/p2p/trpc/instruments.list">
        <div v-if="instruments.data && instruments.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.p2p.instrumentMethod') }}</th>
                <th>{{ $t('intafaced.p2p.instrumentCountry') }}</th>
                <th>{{ $t('intafaced.p2p.instrumentFiat') }}</th>
                <th>{{ $t('intafaced.p2p.instrumentLabel') }}</th>
                <th>{{ $t('intafaced.bank.status') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in instruments.data" :key="row.id">
                <td>{{ row.methodId }}</td>
                <td>{{ row.country }}</td>
                <td>{{ row.fiatCurrency }}</td>
                <td>{{ row.label }}</td>
                <td>{{ row.status }}</td>
                <td>
                  <div class="ix-actions">
                    <Button
                      v-if="ixToken && canRemoveInstrument(row)"
                      size="small"
                      :loading="instrumentRemove.busy && removeInstrumentId === row.id"
                      @click="removeInstrument(row)"
                    >{{ $t('intafaced.p2p.instruments.remove') }}</Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.p2p.instrumentEmpty') }}</div>
      </IxState>
      <IxState compact v-if="instrumentRemove.ran" :loading="instrumentRemove.busy" :reason="instrumentRemove.reason" :message="instrumentRemove.message" endpoint="/api/p2p/trpc/instruments.remove">
        <div v-if="instrumentRemove.data" class="ix-done">
          <strong>{{ $t('intafaced.p2p.instruments.removeDone') }}</strong>
          <div class="ix-kv" style="margin-top:8px;">
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.instrumentId') }}</span><span class="v">{{ instrumentRemove.data.id }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.bank.status') }}</span><span class="v">{{ instrumentRemove.data.status }}</span></div>
          </div>
        </div>
      </IxState>
    </div>

    <div id="p2p-offers" class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.p2p.offers') }}</h2>
        <span class="ix-sub">offers.list · trades.take · offers.pause · offers.resume</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.p2p.take.lead') }}</p>
      <IxState compact :loading="methods.loading" :reason="methods.reason" :message="methods.message" endpoint="/api/p2p/trpc/instruments.methods.list">
        <div v-if="registryEmpty" class="ix-note" style="margin-bottom:16px;">{{ $t('intafaced.p2p.take.noMethodRegistry') }}</div>
      </IxState>
      <div class="ix-form-row" style="margin-bottom:16px;">
        <div class="ix-field">
          <label for="ix-p2p-amount">{{ $t('intafaced.p2p.take.amount') }}</label>
          <Input element-id="ix-p2p-amount" v-model="takeAmount" :placeholder="$t('intafaced.p2p.take.amountHint')" />
        </div>
        <div class="ix-field">
          <label for="ix-p2p-method">{{ $t('intafaced.p2p.take.method') }}</label>
          <Input element-id="ix-p2p-method" v-model="takeMethod" :placeholder="$t('intafaced.p2p.take.methodHint')" />
        </div>
      </div>
      <IxState compact :loading="offers.loading" :reason="offers.reason" :message="offers.message" endpoint="/api/p2p/trpc/offers.list">
        <div v-if="offers.data && offers.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.p2p.side') }}</th>
                <th>{{ $t('intafaced.pay.asset') }}</th>
                <th>{{ $t('intafaced.p2p.price') }}</th>
                <th>{{ $t('intafaced.p2p.limits') }}</th>
                <th>{{ $t('intafaced.p2p.take.method') }}</th>
                <th>{{ $t('intafaced.bank.status') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in offers.data" :key="o.id">
                <td :style="{ color: o.side === 'buy' ? 'var(--ix-up)' : 'var(--ix-down)' }">{{ o.side }}</td>
                <td>{{ o.asset }}</td>
                <td>{{ o.price }} {{ o.fiatCurrency }}</td>
                <td>{{ o.minAmount }} – {{ o.maxAmount }}</td>
                <td>{{ methodIds(o) }}</td>
                <td>{{ o.status }}</td>
                <td>
                  <div class="ix-actions">
                    <Button
                      v-if="ixToken && canPause(o)"
                      size="small"
                      :loading="pause.busy && pauseId === o.id"
                      @click="pauseOffer(o)"
                    >{{ $t('intafaced.p2p.pause') }}</Button>
                    <Button
                      v-if="ixToken && canResume(o)"
                      size="small"
                      :loading="pause.busy && pauseId === o.id"
                      @click="resumeOffer(o)"
                    >{{ $t('intafaced.p2p.resume') }}</Button>
                    <Button
                      v-if="ixToken"
                      size="small"
                      :loading="take.busy && takingId === o.id"
                      :disabled="!canTake"
                      @click="takeOffer(o)"
                    >{{ $t('intafaced.p2p.take.action') }}</Button>
                    <router-link v-else to="/platform">{{ $t('intafaced.p2p.take.signIn') }}</router-link>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.state.empty') }}</div>
      </IxState>
      <IxState compact v-if="pause.ran" :loading="pause.busy" :reason="pause.reason" :message="pause.message" :endpoint="pauseEndpoint">
        <div v-if="pause.data" class="ix-done">
          <strong>{{ pauseDoneLabel }}</strong>
          <div class="ix-kv" style="margin-top:8px;">
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.createOfferId') }}</span><span class="v">{{ pause.data.id }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.bank.status') }}</span><span class="v">{{ pause.data.status }}</span></div>
          </div>
        </div>
      </IxState>
      <IxState compact v-if="take.ran" :loading="take.busy" :reason="take.reason" :message="take.message" endpoint="/api/p2p/trpc/trades.take">
        <div v-if="take.data" class="ix-done">
          <strong>{{ $t('intafaced.p2p.take.done') }}</strong>
          <div class="ix-kv" style="margin-top:8px;">
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.take.tradeId') }}</span><span class="v">{{ take.data.id }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.take.status') }}</span><span class="v">{{ take.data.status }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.take.amount') }}</span><span class="v">{{ take.data.amount }} {{ take.data.asset }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.take.fiatAmount') }}</span><span class="v">{{ take.data.fiatAmount }} {{ take.data.fiatCurrency }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.take.method') }}</span><span class="v">{{ take.data.method }}</span></div>
          </div>
        </div>
      </IxState>
    </div>

    <div id="p2p-trades" class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.p2p.trades.title') }}</h2>
        <span class="ix-sub">trades.list · disputes.open · disputes.appendEvidence · disputes.get</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.p2p.trades.lead') }}</p>
      <div class="ix-form-row" style="margin-bottom:16px;">
        <div class="ix-field">
          <label for="ix-p2p-dispute-reason">{{ $t('intafaced.p2p.disputeReason') }}</label>
          <Input element-id="ix-p2p-dispute-reason" v-model="disputeReason" :placeholder="$t('intafaced.p2p.disputeReasonHint')" />
        </div>
        <div class="ix-field">
          <label for="ix-p2p-dispute-evidence">{{ $t('intafaced.p2p.disputeEvidence') }}</label>
          <Input element-id="ix-p2p-dispute-evidence" v-model="disputeEvidenceText" :placeholder="$t('intafaced.p2p.disputeEvidenceHint')" />
        </div>
      </div>
      <IxState compact :loading="trades.loading" :reason="trades.reason" :message="trades.message" endpoint="/api/p2p/trpc/trades.list">
        <div v-if="trades.data && trades.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.p2p.take.tradeId') }}</th>
                <th>{{ $t('intafaced.p2p.take.status') }}</th>
                <th>{{ $t('intafaced.p2p.take.amount') }}</th>
                <th>{{ $t('intafaced.p2p.take.fiatAmount') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in trades.data" :key="t.id">
                <td>{{ t.id }}</td>
                <td>{{ t.status }}</td>
                <td>{{ t.amount }} {{ t.asset }}</td>
                <td>{{ t.fiatAmount }} {{ t.fiatCurrency }}</td>
                <td>
                  <div class="ix-actions">
                    <Button v-if="canMarkSent(t)" size="small" :loading="lifecycle.busy && lifeId === t.id" @click="markFiatSent(t)">{{ $t('intafaced.p2p.trades.markSent') }}</Button>
                    <Button v-if="canConfirm(t)" size="small" :loading="lifecycle.busy && lifeId === t.id" @click="confirmReceived(t)">{{ $t('intafaced.p2p.trades.confirm') }}</Button>
                    <Button v-if="canCancel(t)" size="small" :loading="lifecycle.busy && lifeId === t.id" @click="cancelTrade(t)">{{ $t('intafaced.p2p.trades.cancel') }}</Button>
                    <Button
                      v-if="canOpenDispute(t)"
                      size="small"
                      :loading="disputeOpen.busy && disputeTradeId === t.id"
                      :disabled="!canSubmitOpen"
                      @click="openDispute(t)"
                    >{{ $t('intafaced.p2p.disputes.open') }}</Button>
                    <Button
                      v-if="canAppendEvidence(t)"
                      size="small"
                      :loading="disputeAppend.busy && disputeTradeId === t.id"
                      :disabled="!canSubmitAppend"
                      @click="appendEvidence(t)"
                    >{{ $t('intafaced.p2p.disputes.append') }}</Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.p2p.trades.empty') }}</div>
      </IxState>
      <IxState compact v-if="lifecycle.ran" :loading="lifecycle.busy" :reason="lifecycle.reason" :message="lifecycle.message" :endpoint="lifeEndpoint">
        <div v-if="lifecycle.data" class="ix-done">
          <strong>{{ $t('intafaced.p2p.trades.updated') }}</strong>
          <div class="ix-kv" style="margin-top:8px;">
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.take.tradeId') }}</span><span class="v">{{ lifecycle.data.id }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.take.status') }}</span><span class="v">{{ lifecycle.data.status }}</span></div>
          </div>
        </div>
      </IxState>
      <IxState compact v-if="disputeOpen.ran" :loading="disputeOpen.busy" :reason="disputeOpen.reason" :message="disputeOpen.message" endpoint="/api/p2p/trpc/disputes.open">
        <div v-if="disputeOpen.data" class="ix-done">
          <strong>{{ $t('intafaced.p2p.disputes.openDone') }}</strong>
          <div class="ix-kv" style="margin-top:8px;">
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.disputeId') }}</span><span class="v">{{ disputeOpen.data.disputeId }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.take.tradeId') }}</span><span class="v">{{ disputeOpen.data.tradeId }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.disputeChatThread') }}</span><span class="v">{{ disputeOpen.data.chatThreadId }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.disputeDeadline') }}</span><span class="v">{{ disputeOpen.data.deadlineAt }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.disputeIfNobodyRules') }}</span><span class="v">{{ disputeOpen.data.ifNobodyRules }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.disputeModerationReachable') }}</span><span class="v">{{ disputeOpen.data.moderationReachable }}</span></div>
          </div>
        </div>
      </IxState>
      <IxState compact v-if="disputeAppend.ran" :loading="disputeAppend.busy" :reason="disputeAppend.reason" :message="disputeAppend.message" endpoint="/api/p2p/trpc/disputes.appendEvidence">
        <div v-if="disputeAppend.data" class="ix-done">
          <strong>{{ $t('intafaced.p2p.disputes.appendDone') }}</strong>
          <div class="ix-kv" style="margin-top:8px;">
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.disputeId') }}</span><span class="v">{{ disputeAppend.data.disputeId }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.take.tradeId') }}</span><span class="v">{{ disputeAppend.data.tradeId }}</span></div>
          </div>
          <div v-if="disputeAppend.data.evidence && disputeAppend.data.evidence.length" class="ix-scroll" style="margin-top:8px;">
            <table class="ix-table">
              <thead>
                <tr>
                  <th>{{ $t('intafaced.p2p.disputeEvidenceSeq') }}</th>
                  <th>{{ $t('intafaced.p2p.disputeEvidenceItem') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in disputeAppend.data.evidence" :key="'append-' + entry.seq">
                  <td>{{ entry.seq }}</td>
                  <td>{{ formatEvidenceItem(entry.item) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </IxState>
      <IxState compact v-if="dispute.loading || dispute.reason" :loading="dispute.loading" :reason="dispute.reason" :message="dispute.message" endpoint="/api/p2p/trpc/disputes.get">
        <div v-if="dispute.data" class="ix-done">
          <div class="ix-kv">
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.disputeId') }}</span><span class="v">{{ dispute.data.id }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.take.tradeId') }}</span><span class="v">{{ dispute.data.tradeId }}</span></div>
            <div v-if="dispute.data.chatThreadId" class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.disputeChatThread') }}</span><span class="v">{{ dispute.data.chatThreadId }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.disputeStatus') }}</span><span class="v">{{ dispute.data.status }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.disputeDeadline') }}</span><span class="v">{{ dispute.data.deadlineAt }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.disputeOverdue') }}</span><span class="v">{{ dispute.data.overdue }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.disputeOpenedVia') }}</span><span class="v">{{ dispute.data.openedVia }}</span></div>
          </div>
          <div v-if="dispute.data.evidence && dispute.data.evidence.length" class="ix-scroll" style="margin-top:8px;">
            <table class="ix-table">
              <thead>
                <tr>
                  <th>{{ $t('intafaced.p2p.disputeEvidenceSeq') }}</th>
                  <th>{{ $t('intafaced.p2p.disputeEvidenceAt') }}</th>
                  <th>{{ $t('intafaced.p2p.disputeEvidenceItem') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in dispute.data.evidence" :key="'get-' + entry.seq">
                  <td>{{ entry.seq }}</td>
                  <td>{{ entry.submittedAt === null ? '—' : entry.submittedAt }}</td>
                  <td>{{ formatEvidenceItem(entry.item) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="ix-note ix-note-quiet" style="margin-top:8px;">{{ $t('intafaced.p2p.disputeEvidenceEmpty') }}</div>
        </div>
      </IxState>
    </div>

    <div id="p2p-fiat" class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.p2p.fiat') }}</h2>
        <span class="ix-sub">fiat.list</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.p2p.fiatLead') }}
      </p>
      <IxState compact :loading="fiat.loading" :reason="fiat.reason" :message="fiat.message" endpoint="/api/p2p/trpc/fiat.list">
        <div v-if="fiat.data && fiat.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.p2p.code') }}</th>
                <th>{{ $t('intafaced.p2p.name') }}</th>
                <th>{{ $t('intafaced.p2p.symbol') }}</th>
                <th>{{ $t('intafaced.p2p.minorUnits') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in fiat.data" :key="f.code">
                <td>{{ f.code }}</td>
                <td>{{ f.name }}</td>
                <td>{{ f.symbol }}</td>
                <td>{{ f.minorUnits }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.state.empty') }}</div>
      </IxState>
    </div>
  </div>
</template>

<script>
/**
 * svc-p2p (§6.2).
 *
 * `fiat.list` is a `publicProcedure` and returns the real enabled-currency
 * table — the one honest, unauthenticated read this module has today.
 *
 * `offers.list` is different in an instructive way. The scope it wants,
 * `p2p:read`, IS issued to an interactive session, so this is not the scope
 * gap that stops svc-bank. It is the jurisdiction matrix: the module demands
 * verification tier "basic" and a fresh account is tier "none". That refusal is
 * policy working, so it is shown as the service worded it rather than softened
 * into "no offers found".
 *
 * Take posts {offerId, amount, method} as the router takes them. Amount stays a
 * decimal string. This screen never posts a lock and never invents a rail.
 *
 * Create posts {side, asset, fiatCurrency, priceType, price, minAmount,
 * maxAmount, methods} the same way. Optional totalAmount and terms are omitted
 * when blank. Amounts stay decimal strings. methods are non-empty string ids.
 *
 * Pause and resume post {offerId} on the caller's own row. They do not move
 * escrow. Named refuse stays named.
 *
 * Instrument save posts {methodId, country, fiatCurrency, details} and an
 * optional label. details keys come only from the selected method schema.
 * The list is headers only. Remove posts {instrumentId} on an own row.
 * Empty registry is a named refuse, not a seeded rail.
 *
 * Merchant apply posts no body besides the session — never a userId.
 * Withdraw posts {reason} with min length 1. Never applied is me=null,
 * not "rejected". Named refuse stays named. No offer ceilings.
 *
 * Open dispute posts {tradeId, reason, evidence?} on a party row in
 * escrowed or fiat_sent. Append posts {tradeId, evidence} with at least
 * one item, only while the dispute is open. Evidence is append-only —
 * this screen has no edit and no remove. ifNobodyRules is the service
 * literal escalated_and_held. moderationReachable is printed from the
 * open reply, never implied when the field is false.
 */
import IxState from '../../components/intafaced/IxState.vue';
import { query, mutate, subjectOf } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxP2P',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      offers: this.emptySection(),
      fiat: this.emptySection(),
      methods: this.emptySection(),
      take: this.emptyAction(),
      create: this.emptyAction(),
      pause: this.emptyAction(),
      instruments: this.emptySection(),
      instrumentSave: this.emptyAction(),
      instrumentRemove: this.emptyAction(),
      trades: this.emptySection(),
      lifecycle: this.emptyAction(),
      merchant: this.emptySection(),
      apiAccess: this.emptySection(),
      merchantApply: this.emptyAction(),
      merchantWithdraw: this.emptyAction(),
      withdrawReason: '',
      disputeOpen: this.emptyAction(),
      disputeAppend: this.emptyAction(),
      dispute: { loading: false, reason: null, message: '', data: null },
      disputeReason: '',
      disputeEvidenceText: '',
      disputeTradeId: '',
      takeAmount: '',
      takeMethod: '',
      takingId: '',
      pauseId: '',
      pauseEndpoint: '/api/p2p/trpc/offers.pause',
      removeInstrumentId: '',
      lifeId: '',
      lifeEndpoint: '/api/p2p/trpc/trades.list',
      instrumentForm: {
        methodId: '',
        country: '',
        fiatCurrency: '',
        label: '',
        details: {}
      },
      createForm: {
        side: 'sell',
        asset: '',
        fiatCurrency: '',
        priceType: 'fixed',
        price: '',
        minAmount: '',
        maxAmount: '',
        totalAmount: '',
        methods: '',
        terms: ''
      }
    };
  },
  computed: {
    registryEmpty() {
      return this.methods.reason === 'ok' && Array.isArray(this.methods.data) && this.methods.data.length === 0;
    },
    canTake() {
      return !!(this.takeAmount && this.takeMethod && !this.take.busy);
    },
    createMethodIds() {
      return (this.createForm.methods || '')
        .split(',')
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s; });
    },
    canCreate() {
      var f = this.createForm;
      return !!(
        f.side &&
        f.priceType &&
        (f.asset || '').trim() &&
        (f.fiatCurrency || '').trim() &&
        (f.price || '').trim() &&
        (f.minAmount || '').trim() &&
        (f.maxAmount || '').trim() &&
        this.createMethodIds.length &&
        !this.create.busy
      );
    },
    instrumentMethodChoice: {
      get() {
        var f = this.instrumentForm;
        var id = (f.methodId || '').trim();
        var rows = this.methods.data;
        if (!id || !rows || !rows.length) return '';
        var country = (f.country || '').trim().toUpperCase();
        var wildcard = '';
        for (var i = 0; i < rows.length; i++) {
          var s = rows[i];
          if (s.methodId !== id) continue;
          if (s.country === country) return s.methodId + '|' + s.country;
          if (s.country === '*') wildcard = s.methodId + '|*';
        }
        return wildcard;
      },
      set(v) {
        if (!v) {
          this.instrumentForm.methodId = '';
          return;
        }
        var bar = v.indexOf('|');
        this.instrumentForm.methodId = bar === -1 ? v : v.slice(0, bar);
        var country = bar === -1 ? '' : v.slice(bar + 1);
        if (country && country !== '*') this.instrumentForm.country = country;
      }
    },
    instrumentDetailFields() {
      var rows = this.methods.data;
      if (!rows || !rows.length) return [];
      var methodId = (this.instrumentForm.methodId || '').trim();
      var country = (this.instrumentForm.country || '').trim().toUpperCase();
      if (!methodId) return [];
      var match = null;
      for (var i = 0; i < rows.length; i++) {
        var s = rows[i];
        if (s.methodId !== methodId) continue;
        if (s.country === country) {
          match = s;
          break;
        }
        if (s.country === '*' && !match) match = s;
      }
      return (match && match.fields) ? match.fields : [];
    },
    canSaveInstrument() {
      var f = this.instrumentForm;
      var country = (f.country || '').trim();
      var fiat = (f.fiatCurrency || '').trim();
      return !!(
        (f.methodId || '').trim() &&
        country.length === 2 &&
        fiat.length === 3 &&
        !this.instrumentSave.busy
      );
    },
    myId() {
      return subjectOf(this.ixToken);
    },
    pauseDoneLabel() {
      return this.pauseEndpoint.indexOf('offers.resume') !== -1
        ? this.$t('intafaced.p2p.resumeDone')
        : this.$t('intafaced.p2p.pauseDone');
    },
    hasLiveMerchantStanding() {
      var d = this.merchant.data;
      if (!d || !d.status) return false;
      return d.status === 'applied' || d.status === 'approved' || d.status === 'suspended';
    },
    canApply() {
      return !!(this.ixToken && !this.merchantApply.busy && !this.hasLiveMerchantStanding);
    },
    canWithdraw() {
      return !!(
        this.ixToken &&
        this.hasLiveMerchantStanding &&
        (this.withdrawReason || '').trim() &&
        !this.merchantWithdraw.busy
      );
    },
    disputeEvidenceItems() {
      var raw = (this.disputeEvidenceText || '').trim();
      if (!raw) return [];
      return [raw];
    },
    canSubmitOpen() {
      var reason = (this.disputeReason || '').trim();
      return !!(reason.length >= 1 && reason.length <= 2000 && !this.disputeOpen.busy);
    },
    canSubmitAppend() {
      return !!(this.disputeEvidenceItems.length && !this.disputeAppend.busy);
    }
  },
  watch: {
    instrumentDetailFields: {
      immediate: true,
      handler(fields) {
        var next = {};
        var prev = this.instrumentForm.details || {};
        for (var i = 0; i < fields.length; i++) {
          var key = fields[i].key;
          next[key] = typeof prev[key] === 'string' ? prev[key] : '';
        }
        this.instrumentForm.details = next;
      }
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('offers', query('p2p', 'offers.list', undefined, this.ixToken));
    this.load('fiat', query('p2p', 'fiat.list', undefined, this.ixToken));
    this.load('methods', query('p2p', 'instruments.methods.list', undefined, this.ixToken));
    this.load('instruments', query('p2p', 'instruments.list', undefined, this.ixToken));
    this.loadMerchantStanding();
    this.loadTrades();
  },
  methods: {
    methodIds(offer) {
      var out = [];
      var methods = offer && offer.methods;
      if (!methods || !methods.length) return '';
      for (var i = 0; i < methods.length; i++) {
        var x = methods[i];
        if (typeof x === 'string' && x) out.push(x);
        else if (x && typeof x.id === 'string' && x.id) out.push(x.id);
      }
      return out.join(', ');
    },
    isMine(offer) {
      return !!(offer && this.myId && offer.makerId === this.myId);
    },
    canPause(offer) {
      return this.isMine(offer) && offer.status === 'active';
    },
    canResume(offer) {
      return this.isMine(offer) && offer.status === 'paused';
    },
    keepOffer(offer, status, data) {
      var rows = (this.offers.data || []).slice();
      var next = Object.assign({}, offer, data || {}, { status: (data && data.status) || status });
      var found = false;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].id === offer.id) {
          rows[i] = next;
          found = true;
          break;
        }
      }
      if (!found) rows.unshift(next);
      this.offers.data = rows;
    },
    pauseOffer(offer) {
      var self = this;
      if (!offer || this.pause.busy) return;
      this.pauseId = offer.id;
      this.pauseEndpoint = '/api/p2p/trpc/offers.pause';
      this.act('pause', mutate('p2p', 'offers.pause', { offerId: offer.id }, this.ixToken)).then(function (res) {
        self.pauseId = '';
        if (res.ok) self.keepOffer(offer, 'paused', res.data);
      });
    },
    resumeOffer(offer) {
      var self = this;
      if (!offer || this.pause.busy) return;
      this.pauseId = offer.id;
      this.pauseEndpoint = '/api/p2p/trpc/offers.resume';
      this.act('pause', mutate('p2p', 'offers.resume', { offerId: offer.id }, this.ixToken)).then(function (res) {
        self.pauseId = '';
        if (res.ok) {
          self.keepOffer(offer, 'active', res.data);
          self.load('offers', query('p2p', 'offers.list', undefined, self.ixToken));
        }
      });
    },
    takeOffer(offer) {
      var self = this;
      if (!this.canTake || !offer) return;
      this.takingId = offer.id;
      this.act(
        'take',
        mutate('p2p', 'trades.take', { offerId: offer.id, amount: this.takeAmount, method: this.takeMethod }, this.ixToken)
      ).then(function () {
        self.takingId = '';
        self.loadTrades();
      });
    },
    instrumentDetailsPayload() {
      var details = {};
      var fields = this.instrumentDetailFields;
      var src = this.instrumentForm.details || {};
      for (var i = 0; i < fields.length; i++) {
        var key = fields[i].key;
        var val = (src[key] || '').trim();
        if (val) details[key] = val;
      }
      return details;
    },
    canRemoveInstrument(row) {
      return !!(row && row.id && row.status === 'active');
    },
    saveInstrument() {
      var self = this;
      if (!this.canSaveInstrument) return;
      var f = this.instrumentForm;
      var input = {
        methodId: (f.methodId || '').trim(),
        country: (f.country || '').trim().toUpperCase(),
        fiatCurrency: (f.fiatCurrency || '').trim().toUpperCase(),
        details: this.instrumentDetailsPayload()
      };
      var label = (f.label || '').trim();
      if (label) input.label = label;
      this.act('instrumentSave', mutate('p2p', 'instruments.create', input, this.ixToken)).then(function (res) {
        if (res.ok) self.load('instruments', query('p2p', 'instruments.list', undefined, self.ixToken));
      });
    },
    removeInstrument(row) {
      var self = this;
      if (!this.canRemoveInstrument(row) || this.instrumentRemove.busy) return;
      this.removeInstrumentId = row.id;
      this.act('instrumentRemove', mutate('p2p', 'instruments.remove', { instrumentId: row.id }, this.ixToken)).then(function (res) {
        self.removeInstrumentId = '';
        if (res.ok) self.load('instruments', query('p2p', 'instruments.list', undefined, self.ixToken));
      });
    },
    createOffer() {
      var self = this;
      if (!this.canCreate) return;
      var f = this.createForm;
      var methods = this.createMethodIds;
      if (!methods.length) return;
      var input = {
        side: f.side,
        asset: (f.asset || '').trim().toUpperCase(),
        fiatCurrency: (f.fiatCurrency || '').trim().toUpperCase(),
        priceType: f.priceType,
        price: (f.price || '').trim(),
        minAmount: (f.minAmount || '').trim(),
        maxAmount: (f.maxAmount || '').trim(),
        methods: methods
      };
      var totalAmount = (f.totalAmount || '').trim();
      if (totalAmount) input.totalAmount = totalAmount;
      var terms = (f.terms || '').trim();
      if (terms) input.terms = terms;
      this.act('create', mutate('p2p', 'offers.create', input, this.ixToken)).then(function (res) {
        if (res.ok) {
          self.load('offers', query('p2p', 'offers.list', undefined, self.ixToken));
        }
      });
    },
    loadTrades() {
      this.load('trades', query('p2p', 'trades.list', { limit: 50 }, this.ixToken));
    },
    loadMerchantStanding() {
      this.load('merchant', query('p2p', 'merchants.me', undefined, this.ixToken));
      this.load('apiAccess', query('p2p', 'merchants.apiAccess', undefined, this.ixToken));
    },
    submitMerchantApplication() {
      var self = this;
      if (!this.canApply) return;
      this.act('merchantApply', mutate('p2p', 'merchants.submitApplication', undefined, this.ixToken)).then(function (res) {
        if (res.ok) self.loadMerchantStanding();
      });
    },
    withdrawMerchant() {
      var self = this;
      var reason = (this.withdrawReason || '').trim();
      if (!reason || !this.canWithdraw) return;
      this.act('merchantWithdraw', mutate('p2p', 'merchants.withdraw', { reason: reason }, this.ixToken)).then(function (res) {
        if (res.ok) {
          self.withdrawReason = '';
          self.loadMerchantStanding();
        }
      });
    },
    canMarkSent(trade) {
      return !!(trade && this.myId && trade.status === 'escrowed' && trade.buyerId === this.myId);
    },
    canConfirm(trade) {
      return !!(trade && this.myId && trade.status === 'fiat_sent' && trade.sellerId === this.myId);
    },
    canCancel(trade) {
      if (!trade || !this.myId) return false;
      if (trade.status === 'escrowed' && (trade.buyerId === this.myId || trade.sellerId === this.myId)) return true;
      return trade.status === 'fiat_sent' && trade.sellerId === this.myId;
    },
    runLifecycle(procedure, trade) {
      var self = this;
      if (this.lifecycle.busy || !trade) return;
      this.lifeId = trade.id;
      this.lifeEndpoint = '/api/p2p/trpc/' + procedure;
      this.act('lifecycle', mutate('p2p', procedure, { tradeId: trade.id }, this.ixToken)).then(function () {
        self.lifeId = '';
        self.loadTrades();
      });
    },
    markFiatSent(trade) {
      this.runLifecycle('trades.markFiatSent', trade);
    },
    confirmReceived(trade) {
      this.runLifecycle('trades.confirmReceived', trade);
    },
    cancelTrade(trade) {
      this.runLifecycle('trades.cancel', trade);
    },
    isTradeParty(trade) {
      return !!(trade && this.myId && (trade.buyerId === this.myId || trade.sellerId === this.myId));
    },
    canOpenDispute(trade) {
      return !!(this.isTradeParty(trade) && (trade.status === 'escrowed' || trade.status === 'fiat_sent'));
    },
    canAppendEvidence(trade) {
      return !!(this.isTradeParty(trade) && trade.status === 'disputed');
    },
    formatEvidenceItem(item) {
      if (item == null) return '';
      if (typeof item === 'string') return item;
      try {
        return JSON.stringify(item);
      } catch (e) {
        return '';
      }
    },
    loadDispute(tradeId) {
      if (!tradeId) return;
      this.load('dispute', query('p2p', 'disputes.get', { tradeId: tradeId }, this.ixToken));
    },
    openDispute(trade) {
      var self = this;
      var reason = (this.disputeReason || '').trim();
      if (!this.canOpenDispute(trade) || !this.canSubmitOpen() || !reason) return;
      var input = { tradeId: trade.id, reason: reason };
      var evidence = this.disputeEvidenceItems;
      if (evidence.length) input.evidence = evidence;
      this.disputeTradeId = trade.id;
      this.act('disputeOpen', mutate('p2p', 'disputes.open', input, this.ixToken)).then(function (res) {
        self.disputeTradeId = '';
        if (res.ok) {
          self.loadTrades();
          self.loadDispute(trade.id);
        }
      });
    },
    appendEvidence(trade) {
      var self = this;
      var evidence = this.disputeEvidenceItems;
      if (!this.canAppendEvidence(trade) || !this.canSubmitAppend() || !evidence.length) return;
      this.disputeTradeId = trade.id;
      this.act(
        'disputeAppend',
        mutate('p2p', 'disputes.appendEvidence', { tradeId: trade.id, evidence: evidence }, this.ixToken)
      ).then(function (res) {
        self.disputeTradeId = '';
        if (res.ok) {
          self.disputeEvidenceText = '';
          self.loadTrades();
          self.loadDispute(trade.id);
        }
      });
    }
  }
};
</script>
