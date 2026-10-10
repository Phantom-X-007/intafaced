'use strict';
let assert = require('node:assert/strict');
let crypto = require('node:crypto').webcrypto;
let fs = require('node:fs');
let path = require('node:path');
let intake = require('./outreach-intake.js');
let countries = require('./outreach-countries.js').countryOptions('en');
let contact = {
  name: 'Visitor',
  email: 'VISITOR@example.com',
  organisationName: 'Example',
  country: 'id',
  interests: intake.AUDIENCES.slice(),
  marketingOptIn: false,
};
let forms = {
  investor: {
    investorType: 'individual',
    participation: 'both',
    decisionRole: 'decision_maker',
    amountStatus: 'stated',
    amount: '9007199254740993.000000000000000001',
    currency: 'USD',
  },
  trader: { markets: ['spot', 'algorithmic'], experience: 'advanced', role: 'professional', platformInterest: 'API access' },
  merchant: {
    businessName: 'Example',
    website: 'https://example.com',
    industry: 'Retail',
    operatingCountries: 'ID, SG',
    services: ['payment_acceptance'],
    amountStatus: 'stated',
    amount: '0.000000000000000001',
    currency: 'IDR',
    period: 'monthly',
  },
  academy: { learningGoal: 'Learn risk management', experience: 'beginner', subjects: 'Risk, Markets', format: 'self_paced' },
  partner: { expertise: 'Education', contribution: 'Build a learning community', relationship: 'collaboration', scope: 'Curriculum' },
};
let questionnaires = intake.AUDIENCES.map(function (a) {
  return intake.buildQuestionnaire(a, Object.assign({ timing: 'undecided', message: 'Hello' }, forms[a]));
});
function storage() {
  let values = {};
  return {
    getItem: function (k) {
      return values[k] || null;
    },
    setItem: function (k, v) {
      values[k] = v;
    },
    removeItem: function (k) {
      delete values[k];
    },
  };
}
function options(store, send) {
  return {
    storage: store,
    crypto: crypto,
    encode: function (v) {
      return Buffer.from(v, 'binary').toString('base64');
    },
    now: Date.now,
    send: send,
  };
}
let id = crypto.randomUUID();
let receipt = {
  submissionId: id,
  revision: 1,
  capturedAt: new Date().toISOString(),
  continuationExpiresAt: new Date(Date.now() + 3600000).toISOString(),
};
let draft = Object.assign({}, receipt, { contact: intake.buildContact(contact), questionnaires: [], completedAt: null });
async function main() {
  assert.equal(countries.length, 249);
  assert.equal(
    new Set(
      countries.map(function (c) {
        return c.code;
      }),
    ).size,
    249,
  );
  assert.equal(
    countries.find(function (c) {
      return c.code === 'ID';
    }).name,
    'Indonesia',
  );
  assert.equal(
    countries.find(function (c) {
      return c.code === 'SG';
    }).name,
    'Singapore',
  );
  assert.ok(
    countries.every(function (c) {
      return /^[A-Z]{2}$/.test(c.code) && c.name.length > 2;
    }),
  );
  assert.equal(
    intake.buildQuestionnaire('investor', Object.assign({ timing: 'later' }, forms.investor, { amountStatus: 'undecided' })).answers
      .indicativeContribution.status,
    'undecided',
  );
  assert.equal(
    intake.buildQuestionnaire(
      'merchant',
      Object.assign({ timing: 'later' }, forms.merchant, { amountStatus: 'unknown', operatingCountries: ['ID', 'SG'] }),
    ).answers.processingVolume.status,
    'unknown',
  );
  assert.equal(questionnaires[0].answers.indicativeContribution.amount, forms.investor.amount);
  assert.equal(questionnaires[2].answers.processingVolume.amount, forms.merchant.amount);
  assert.equal(questionnaires[2].answers.processingVolume.period, 'monthly');
  for (let bad of ['1e6', '-1', '1,000', '00', '1.1234567890123456789', 4])
    assert.throws(function () {
      intake.buildQuestionnaire('investor', Object.assign({ timing: 'later' }, forms.investor, { amount: bad }));
    });
  assert.throws(function () {
    intake.buildQuestionnaire('merchant', Object.assign({ timing: 'later' }, forms.merchant, { period: '' }));
  });
  assert.throws(function () {
    intake.buildQuestionnaire('trader', Object.assign({ timing: 'later' }, forms.trader, { markets: [] }));
  });
  assert.throws(function () {
    intake.buildQuestionnaire('academy', Object.assign({ timing: 'later' }, forms.academy, { subjects: 'Risk,Risk' }));
  });
  assert.equal(intake.validDraft(draft), true);
  assert.equal(intake.validDraft(Object.assign({}, draft, { completedAt: new Date().toISOString() })), false);
  assert.equal(
    intake.validDraft(Object.assign({}, draft, { questionnaires: questionnaires, completedAt: new Date().toISOString() })),
    true,
  );
  let requests = [],
    failCapture = true,
    store = storage();
  let controller = intake.createIntake(
    options(store, async function (method, input) {
      requests.push({ method: method, input: JSON.parse(JSON.stringify(input)) });
      assert.ok(store.getItem(intake.STORAGE_KEY), 'request payload persisted before first send');
      if (method === 'capture') {
        if (failCapture) {
          failCapture = false;
          return { ok: false, message: 'unreachable' };
        }
        return { ok: true, data: receipt }; // Intentionally stale capture receipt.
      }
      if (method === 'answer') {
        draft.questionnaires.push(input.questionnaire);
        draft.revision += 1;
        return { ok: true, data: draft };
      }
      return { ok: true, data: draft };
    }),
  );
  await assert.rejects(controller.capture(contact, 'opaque_campaign_1234'));
  assert.equal(controller.state.draft, null, 'capture failure cannot imply success');
  let pending = JSON.parse(store.getItem(intake.STORAGE_KEY));
  assert.ok(intake.CAPABILITY.test(pending.continuationToken));
  assert.equal(Buffer.from(pending.continuationToken, 'base64url').length, 32);
  assert.notEqual(pending.continuationToken, pending.capture.requestId);
  let reloaded = intake.createIntake(options(store, controllerSend));
  async function controllerSend(method, input) {
    requests.push({ method: method, input: JSON.parse(JSON.stringify(input)) });
    return { ok: true, data: method === 'capture' ? receipt : draft };
  }
  await reloaded.capture(contact, 'opaque_campaign_1234');
  assert.equal(requests[0].input.requestId, requests[1].input.requestId, 'reload/retry uses original request id');
  assert.equal(requests[0].input.continuationToken, requests[1].input.continuationToken);
  await controller.capture(contact, 'opaque_campaign_1234');
  await controller.answer(questionnaires[0]);
  assert.equal(controller.state.draft.revision, 2);
  await controller.capture(contact, 'opaque_campaign_1234');
  assert.equal(controller.state.draft.revision, 2, 'cached capture cannot regress revision');
  await assert.rejects(controller.answer(questionnaires[0]), /answers_already_preserved/);
  let answerRequests = [],
    lost = true;
  let answerController = intake.createIntake(
    options(store, async function (method, input) {
      if (method === 'resume') return { ok: true, data: draft };
      answerRequests.push(input);
      if (lost) {
        lost = false;
        return { ok: false, message: 'unreachable' };
      }
      draft.questionnaires.push(input.questionnaire);
      draft.revision += 1;
      return { ok: true, data: draft };
    }),
  );
  await answerController.resume();
  await assert.rejects(answerController.answer(questionnaires[1]));
  await answerController.answer(questionnaires[1]);
  assert.equal(answerRequests[0].requestId, answerRequests[1].requestId, 'answer retry preserves intent id');
  let failStore = {
    getItem: function () {
      throw new Error('blocked');
    },
    setItem: function () {
      throw new Error('blocked');
    },
    removeItem: function () {},
  };
  let blocked = intake.createIntake(
    options(failStore, async function () {
      return { ok: false, message: 'unreachable' };
    }),
  );
  await assert.rejects(blocked.capture(contact));
  let requestId = blocked.state.local.capture.requestId;
  await assert.rejects(blocked.capture(contact));
  assert.equal(blocked.state.storageAvailable, false);
  assert.equal(blocked.state.local.capture.requestId, requestId, 'in-memory retries work when storage blocked');
  await assert.rejects(blocked.capture(Object.assign({}, contact, { name: 'New intention' })));
  assert.notEqual(blocked.state.local.capture.requestId, requestId, 'edited contact has new intent');
  assert.equal(intake.isIntakeRoute('/academy', 'join.intafaced.com'), true);
  assert.equal(intake.isIntakeRoute('/academy', 'intafaced.com'), false);
  assert.equal(intake.audienceForPath('/join/partner'), 'partner');
  let changedAnswers = intake.createIntake(
    options(store, async function (method) {
      return method === 'resume' ? { ok: true, data: draft } : { ok: false, message: 'unreachable' };
    }),
  );
  await changedAnswers.resume();
  await assert.rejects(changedAnswers.answer(questionnaires[2]));
  let firstAnswerId = changedAnswers.state.local.answer.requestId;
  let changedQuestionnaire = intake.buildQuestionnaire('merchant', Object.assign({ timing: 'later' }, forms.merchant));
  await assert.rejects(changedAnswers.answer(changedQuestionnaire));
  assert.notEqual(changedAnswers.state.local.answer.requestId, firstAnswerId, 'edited answer starts a new intent');
  let denied = intake.createIntake(
    options(store, async function () {
      return { ok: false, message: 'ops.crm.continuation_invalid' };
    }),
  );
  await assert.rejects(denied.resume(), /ops.crm.continuation_invalid/);
  assert.equal(denied.state.draft, null, 'wrong/expired capability reveals no draft');
  // The first response can be lost after durable capture. Its actual TTL is
  // unknown until a receipt arrives, so elapsed browser time must not replace
  // the capability/request identity before the server can reconcile it.
  let retryStore = storage(),
    captureTime = Date.now(),
    retryCalls = [],
    loseReceipt = true;
  let longReceipt = Object.assign({}, receipt, {
    submissionId: crypto.randomUUID(),
    continuationExpiresAt: new Date(captureTime + 24 * 3600000).toISOString(),
  });
  let longDraft = Object.assign({}, longReceipt, { contact: intake.buildContact(contact), questionnaires: [], completedAt: null });
  async function longTtlServer(method, input) {
    retryCalls.push({ method: method, input: JSON.parse(JSON.stringify(input)) });
    if (method === 'capture' && loseReceipt) {
      loseReceipt = false;
      return { ok: false, message: 'unreachable' };
    }
    return { ok: true, data: method === 'capture' ? longReceipt : longDraft };
  }
  let lostReceiptController = intake.createIntake(
    Object.assign(options(retryStore, longTtlServer), {
      now: function () {
        return captureTime;
      },
    }),
  );
  await assert.rejects(lostReceiptController.capture(contact));
  let lostPending = JSON.parse(retryStore.getItem(intake.STORAGE_KEY));
  assert.equal(lostPending.expiresAt, null, 'pending capture does not invent server expiry');
  let delayed = intake.createIntake(
    Object.assign(options(retryStore, longTtlServer), {
      now: function () {
        return captureTime + 2 * 3600000;
      },
    }),
  );
  assert.equal(
    delayed.state.local.capture.requestId,
    lostPending.capture.requestId,
    'lost receipt still recoverable after more than one hour',
  );
  await delayed.capture(contact);
  assert.equal(retryCalls[0].input.requestId, retryCalls[1].input.requestId);
  assert.equal(retryCalls[0].input.continuationToken, retryCalls[1].input.continuationToken);
  assert.equal(delayed.state.draft.submissionId, longReceipt.submissionId);
  assert.equal(delayed.state.local.expiresAt, longReceipt.continuationExpiresAt, 'confirmed receipt establishes actual expiry');
  assert.equal(
    intake.createIntake(
      Object.assign(options(retryStore, longTtlServer), {
        now: function () {
          return captureTime + 25 * 3600000;
        },
      }),
    ).state.local,
    null,
    'confirmed server expiry is still enforced',
  );
  retryStore.setItem(
    intake.STORAGE_KEY,
    JSON.stringify(Object.assign({}, lostPending, { expiresAt: new Date(captureTime + 3600000).toISOString() })),
  );
  let legacyDelayed = intake.createIntake(
    Object.assign(options(retryStore, longTtlServer), {
      now: function () {
        return captureTime + 2 * 3600000;
      },
    }),
  );
  assert.equal(
    legacyDelayed.state.local.continuationToken,
    lostPending.continuationToken,
    'legacy unconfirmed one-hour guess cannot discard retry authority',
  );
  assert.equal(legacyDelayed.state.local.expiresAt, null);
  let expiredPending = intake.createIntake(
    Object.assign(
      options(retryStore, async function () {
        return { ok: false, message: 'ops.crm.continuation_invalid' };
      }),
      {
        now: function () {
          return captureTime + 25 * 3600000;
        },
      },
    ),
  );
  await assert.rejects(expiredPending.capture(contact), /ops.crm.continuation_invalid/);
  assert.equal(expiredPending.state.draft, null, 'retaining a pending retry does not extend backend authority');
  for (let corrupt of [
    function (value) {
      value.capture.requestId = 'not-a-uuid';
    },
    function (value) {
      value.capture.requestId = [value.capture.requestId];
    },
    function (value) {
      value.capture.continuationToken = crypto.randomUUID();
    },
    function (value) {
      value.capture.contact.interests = ['investor', 'investor'];
    },
    function (value) {
      value.capture.sourceKey = 'bad';
    },
    function (value) {
      value.capture.extra = 'unexpected';
    },
  ]) {
    let corruptStore = storage(),
      corruptPending = JSON.parse(JSON.stringify(lostPending));
    corrupt(corruptPending);
    corruptStore.setItem(intake.STORAGE_KEY, JSON.stringify(corruptPending));
    assert.equal(intake.createIntake(options(corruptStore, longTtlServer)).state.local, null, 'malformed pending capture is refused');
  }
  let wrongSubmissionStore = storage();
  wrongSubmissionStore.setItem(
    intake.STORAGE_KEY,
    JSON.stringify(Object.assign({}, lostPending, { receipt: longReceipt, expiresAt: longReceipt.continuationExpiresAt })),
  );
  let wrongSubmission = intake.createIntake(
    options(wrongSubmissionStore, async function () {
      return { ok: true, data: Object.assign({}, longDraft, { submissionId: crypto.randomUUID() }) };
    }),
  );
  await assert.rejects(wrongSubmission.resume(), /invalid_response/);
  assert.equal(wrongSubmission.state.draft, null, 'resume cannot reconcile a different submission');
  assert.equal(wrongSubmission.state.local.receipt.submissionId, longReceipt.submissionId);
  let expiredStore = storage();
  expiredStore.setItem(
    intake.STORAGE_KEY,
    JSON.stringify(
      Object.assign({}, pending, {
        expiresAt: '2020-01-01T00:00:00Z',
        receipt: Object.assign({}, receipt, { continuationExpiresAt: '2020-01-01T00:00:00Z' }),
      }),
    ),
  );
  assert.equal(intake.createIntake(options(expiredStore, async function () {})).state.local, null);
  let component = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/Outreach.vue'), 'utf8');
  assert.ok(component.includes("mutate('ops', 'outreach.' + method, input, null)"));
  assert.equal(
    /localStorage|console\.|analytics|continuationToken.*(?:query|href)/.test(component),
    false,
    'capability has no public URL/log sink',
  );
  console.log('outreach-intake.golden: all five mappings, money strings, privacy, durable retry, revisions and host dispatch passed');
}
main().catch(function (e) {
  console.error(e);
  process.exitCode = 1;
});
