'use strict';

// Public enquiries only. No account token, membership lookup or money arithmetic.
let AUDIENCES = ['investor', 'trader', 'merchant', 'academy', 'partner'];
let ROUTES = { '/invest': 'investor', '/trade': 'trader', '/merchant': 'merchant', '/academy': 'academy', '/partner': 'partner' };
let STORAGE_KEY = 'intafaced.outreach.continuation.v1';
let DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;
let CAPABILITY = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
let UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let timing = [
  ['as_available', 'As available'],
  ['within_three_months', 'Within three months'],
  ['later', 'Later'],
  ['undecided', 'Undecided'],
];
function choices(values) {
  return values.map(function (v) {
    return [
      v,
      v.replace(/_/g, ' ').replace(/^./, function (c) {
        return c.toUpperCase();
      }),
    ];
  });
}
function field(key, label, type, options, max) {
  return { key: key, label: label, type: type || 'text', options: options || [], max: max || 160 };
}
let QUESTIONS = {
  investor: [
    field('investorType', 'Investor type', 'select', choices(['individual', 'family_office', 'fund', 'strategic', 'other'])),
    field('participation', 'How would you like to participate?', 'select', choices(['direct', 'introduction', 'both'])),
    field('decisionRole', 'Your decision-making role', 'select', choices(['decision_maker', 'adviser', 'introducer', 'other'])),
  ],
  trader: [
    field(
      'markets',
      'Markets you are interested in (select at least one)',
      'checks',
      choices(['spot', 'derivatives', 'copy_trading', 'algorithmic', 'other']),
    ),
    field('experience', 'Trading experience', 'select', choices(['beginner', 'intermediate', 'advanced'])),
    field('role', 'Your trading role', 'select', choices(['individual', 'professional', 'community'])),
    field('platformInterest', 'What would you like from a trading platform?'),
  ],
  merchant: [
    field('businessName', 'Business name'),
    field('website', 'Business website (optional)', 'url', [], 2048),
    field('industry', 'Industry'),
    field('operatingCountries', 'Operating countries', 'countries'),
    field(
      'services',
      'Services you are interested in (select at least one)',
      'checks',
      choices(['payment_acceptance', 'settlement', 'payouts', 'other']),
    ),
  ],
  academy: [
    field('learningGoal', 'What would you like to learn?'),
    field('experience', 'Current experience', 'select', choices(['beginner', 'intermediate', 'advanced'])),
    field('subjects', 'Preferred subjects (separated by commas)', 'subjects', [], 809),
    field('format', 'Preferred learning format', 'select', choices(['self_paced', 'live', 'cohort', 'no_preference'])),
  ],
  partner: [
    field('expertise', 'Your expertise'),
    field('contribution', 'What would you like to contribute?', 'textarea', [], 2000),
    field('relationship', 'Preferred relationship', 'select', choices(['collaboration', 'partnership', 'undecided'])),
    field('scope', 'Commercial or delivery scope (optional)', 'textarea', [], 2000),
  ],
};
function fail(code) {
  let e = new Error(code);
  e.code = code;
  throw e;
}
function validate(value, valid) {
  if (!valid) fail('invalid_input');
  return value;
}
function audienceForPath(path) {
  return ROUTES[path.replace(/^\/join(?=\/)/, '')] || null;
}
function isJoinHost(host) {
  return host === 'join.intafaced.com';
}
function isIntakeRoute(path, host) {
  return (
    path === '/join' ||
    path.indexOf('/join/') === 0 ||
    (!!ROUTES[path] && (isJoinHost(host) || ['/invest', '/trade', '/merchant'].indexOf(path) !== -1)) ||
    (path === '/' && isJoinHost(host))
  );
}
function createCapability(crypto, encode) {
  if (!crypto || typeof crypto.getRandomValues !== 'function' || typeof crypto.randomUUID !== 'function') fail('secure_browser_required');
  let bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = Array.prototype.map
    .call(bytes, function (b) {
      return String.fromCharCode(b);
    })
    .join('');
  return encode(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function list(raw, max, item) {
  let values = Array.isArray(raw)
    ? raw.slice()
    : String(raw || '')
        .split(',')
        .map(function (v) {
          return v.trim();
        });
  validate(values, values.length > 0 && values.length <= max && new Set(values).size === values.length && values.every(item));
  return values;
}
function text(value, max, optional) {
  let v = String(value || '').trim();
  return validate(v, v.length <= max && (optional || v.length > 0));
}
function amount(form, volume) {
  if (form.amountStatus !== 'stated') return { status: volume ? 'unknown' : 'undecided' };
  let result = {
    status: 'stated',
    amount: validate(form.amount, typeof form.amount === 'string' && form.amount.length <= 60 && DECIMAL.test(form.amount)),
    currency: validate(form.currency, /^[A-Z]{3}$/.test(form.currency)),
  };
  if (volume) result.period = validate(form.period, ['daily', 'monthly', 'annual'].indexOf(form.period) !== -1);
  return result;
}
function buildQuestionnaire(audience, form) {
  validate(audience, AUDIENCES.indexOf(audience) !== -1);
  let answers = {};
  QUESTIONS[audience].forEach(function (f) {
    let value = form[f.key];
    if (f.type === 'checks')
      answers[f.key] = list(value, f.options.length, function (v) {
        return f.options.some(function (o) {
          return o[0] === v;
        });
      });
    else if (f.type === 'countries')
      answers[f.key] = list(String(value || '').toUpperCase(), 50, function (v) {
        return /^[A-Z]{2}$/.test(v);
      });
    else if (f.type === 'subjects')
      answers[f.key] = list(value, 10, function (v) {
        return v.length > 0 && v.length <= 80;
      });
    else if (f.type === 'select')
      answers[f.key] = validate(
        value,
        f.options.some(function (o) {
          return o[0] === value;
        }),
      );
    else {
      let v = text(value, f.max, f.key === 'website' || f.key === 'scope');
      if (f.key === 'website' && v) {
        let url;
        try {
          url = new URL(v);
        } catch (e) {
          fail('invalid_input');
        }
        validate(v, /^https?:$/.test(url.protocol));
      }
      if (v) answers[f.key] = v;
    }
  });
  answers.timing = validate(
    form.timing,
    timing.some(function (o) {
      return o[0] === form.timing;
    }),
  );
  let message = text(form.message, 2000, true);
  if (message) answers.message = message;
  if (audience === 'investor') answers.indicativeContribution = amount(form, false);
  if (audience === 'merchant') answers.processingVolume = amount(form, true);
  return { audience: audience, version: 1, answers: answers };
}
function buildContact(form) {
  validate(form.marketingOptIn, typeof form.marketingOptIn === 'boolean');
  let result = {
    name: text(form.name, 120),
    email: text(form.email, 254).toLowerCase(),
    interests: list(form.interests, 5, function (v) {
      return AUDIENCES.indexOf(v) !== -1;
    }),
    marketingOptIn: form.marketingOptIn === true,
  };
  validate(result.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email));
  let org = text(form.organisationName, 160, true);
  if (org) result.organisationName = org;
  let country = text(form.country, 2, true).toUpperCase();
  if (country) result.country = validate(country, /^[A-Z]{2}$/.test(country));
  return result;
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(function (k) {
          return JSON.stringify(k) + ':' + canonical(value[k]);
        })
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
function timestamp(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
function exactKeys(value, keys) {
  return !!value && typeof value === 'object' && canonical(Object.keys(value).sort()) === canonical(keys.slice().sort());
}
function receiptFields(data) {
  return (
    data &&
    typeof data.submissionId === 'string' &&
    UUID.test(data.submissionId) &&
    Number.isInteger(data.revision) &&
    data.revision > 0 &&
    timestamp(data.capturedAt) &&
    timestamp(data.continuationExpiresAt)
  );
}
function validReceipt(data) {
  return exactKeys(data, ['submissionId', 'revision', 'capturedAt', 'continuationExpiresAt']) && receiptFields(data);
}
function validDraft(data) {
  if (
    !exactKeys(data, ['submissionId', 'revision', 'capturedAt', 'continuationExpiresAt', 'contact', 'questionnaires', 'completedAt']) ||
    !receiptFields(data) ||
    !data.contact ||
    !Array.isArray(data.questionnaires)
  )
    return false;
  try {
    if (canonical(buildContact(data.contact)) !== canonical(data.contact)) return false;
    let seen = [];
    data.questionnaires.forEach(function (q) {
      if (!q || q.version !== 1 || !data.contact.interests.includes(q.audience) || seen.includes(q.audience)) fail('invalid_response');
      seen.push(q.audience);
      let a = Object.assign({}, q.answers);
      let money = a.indicativeContribution || a.processingVolume;
      if (money) Object.assign(a, { amountStatus: money.status, amount: money.amount, currency: money.currency, period: money.period });
      if (canonical(buildQuestionnaire(q.audience, a)) !== canonical(q)) fail('invalid_response');
    });
    return (
      data.completedAt === null ||
      (timestamp(data.completedAt) &&
        Date.parse(data.completedAt) >= Date.parse(data.capturedAt) &&
        seen.length === data.contact.interests.length)
    );
  } catch (e) {
    return false;
  }
}
function errorCopy(code) {
  if (/continuation_invalid/.test(code))
    return 'This saved enquiry can no longer be reopened here. You can start a new enquiry; previously saved information remains with the team.';
  if (/revision_conflict|answers_already_preserved/.test(code))
    return 'Your enquiry changed in another request. Reopen the saved enquiry to see the latest progress.';
  if (/rate_limited/.test(code)) return 'Too many attempts. Wait one minute, then try again.';
  if (code === 'invalid_input')
    return 'Check the required fields, selections, country codes and amount format. Amounts use digits and an optional decimal point.';
  if (code === 'secure_browser_required') return 'A secure browser connection is required. Open this page over HTTPS in a current browser.';
  return 'We could not confirm this save. Your entries remain here. Try again with the same entries to safely check the result.';
}
function validSavedCapture(input, token) {
  if (!input || !exactKeys(input, ['requestId', 'continuationToken', 'contact'].concat(input.sourceKey === undefined ? [] : ['sourceKey'])))
    return false;
  if (
    input.continuationToken !== token ||
    typeof token !== 'string' ||
    !CAPABILITY.test(token) ||
    typeof input.requestId !== 'string' ||
    !UUID.test(input.requestId)
  )
    return false;
  if (input.sourceKey !== undefined && (typeof input.sourceKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(input.sourceKey)))
    return false;
  try {
    return canonical(buildContact(input.contact)) === canonical(input.contact);
  } catch (e) {
    return false;
  }
}
function validSavedAnswer(input, saved) {
  if (input === null) return true;
  if (!saved.receipt || !exactKeys(input, ['submissionId', 'continuationToken', 'requestId', 'expectedRevision', 'questionnaire']))
    return false;
  if (
    input.submissionId !== saved.receipt.submissionId ||
    input.continuationToken !== saved.continuationToken ||
    typeof input.requestId !== 'string' ||
    !UUID.test(input.requestId)
  )
    return false;
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1 || input.expectedRevision > saved.receipt.revision)
    return false;
  return validDraft(
    Object.assign({}, saved.receipt, { contact: saved.capture.contact, questionnaires: [input.questionnaire], completedAt: null }),
  );
}
function createIntake(options) {
  let state = { local: null, draft: null, busy: false, storageAvailable: true };
  function persist() {
    try {
      options.storage.setItem(STORAGE_KEY, JSON.stringify(state.local));
    } catch (e) {
      state.storageAvailable = false;
    }
  }
  function read() {
    try {
      let raw = options.storage.getItem(STORAGE_KEY);
      if (!raw) return;
      let saved = JSON.parse(raw);
      if (
        !exactKeys(saved, ['continuationToken', 'expiresAt', 'capture', 'receipt', 'answer']) ||
        !validSavedCapture(saved.capture, saved.continuationToken) ||
        !validSavedAnswer(saved.answer, saved)
      ) {
        options.storage.removeItem(STORAGE_KEY);
        return;
      }
      if (saved.receipt !== null) {
        if (
          !validReceipt(saved.receipt) ||
          saved.expiresAt !== saved.receipt.continuationExpiresAt ||
          Date.parse(saved.expiresAt) <= options.now()
        ) {
          options.storage.removeItem(STORAGE_KEY);
          return;
        }
      } else {
        // A lost capture response leaves server expiry unknown. Keep only the
        // original retry intent in this tab; the server still checks its TTL.
        // Also recover pending captures written by the former one-hour guess.
        saved.expiresAt = null;
      }
      state.local = saved;
    } catch (e) {
      state.storageAvailable = false;
    }
  }
  async function call(method, input, validator) {
    let response = await options.send(method, input);
    if (!response || !response.ok) fail((response && (response.intafacedCode || response.message)) || 'unreachable');
    if (!validator(response.data)) fail('invalid_response');
    return response.data;
  }
  async function resume() {
    if (!state.local || !state.local.receipt) fail('continuation_missing');
    let draft = await call(
      'resume',
      { submissionId: state.local.receipt.submissionId, continuationToken: state.local.continuationToken },
      validDraft,
    );
    if (draft.submissionId !== state.local.receipt.submissionId) fail('invalid_response');
    if (state.draft && state.draft.submissionId === draft.submissionId && draft.revision < state.draft.revision) fail('invalid_response');
    state.draft = draft;
    state.local.receipt = {
      submissionId: draft.submissionId,
      revision: draft.revision,
      capturedAt: draft.capturedAt,
      continuationExpiresAt: draft.continuationExpiresAt,
    };
    state.local.expiresAt = draft.continuationExpiresAt;
    if (
      state.local.answer &&
      draft.questionnaires.some(function (q) {
        return q.audience === state.local.answer.questionnaire.audience;
      })
    )
      state.local.answer = null;
    persist();
    return draft;
  }
  async function capture(form, sourceKey) {
    let contact = buildContact(form);
    let source = typeof sourceKey === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(sourceKey) ? sourceKey : undefined;
    if (
      !state.local ||
      !state.local.capture ||
      canonical(state.local.capture.contact) !== canonical(contact) ||
      state.local.capture.sourceKey !== source
    ) {
      let token = createCapability(options.crypto, options.encode);
      let input = { requestId: options.crypto.randomUUID(), continuationToken: token, contact: contact };
      if (source) input.sourceKey = source;
      state.draft = null;
      state.local = {
        continuationToken: token,
        expiresAt: null,
        capture: input,
        receipt: null,
        answer: null,
      };
      persist();
    }
    let receipt = await call('capture', state.local.capture, validReceipt);
    if (state.local.receipt && receipt.submissionId !== state.local.receipt.submissionId) fail('invalid_response');
    state.local.receipt = receipt;
    state.local.expiresAt = receipt.continuationExpiresAt;
    persist();
    return resume(); // Cached capture receipts can be older than the current draft.
  }
  async function answer(questionnaire) {
    if (!state.draft || !state.local) fail('continuation_missing');
    if (
      state.draft.questionnaires.some(function (q) {
        return q.audience === questionnaire.audience;
      })
    )
      fail('answers_already_preserved');
    let pending = state.local.answer;
    if (
      !pending ||
      JSON.stringify(pending.questionnaire) !== JSON.stringify(questionnaire) ||
      pending.expectedRevision !== state.draft.revision
    ) {
      state.local.answer = {
        submissionId: state.draft.submissionId,
        continuationToken: state.local.continuationToken,
        requestId: options.crypto.randomUUID(),
        expectedRevision: state.draft.revision,
        questionnaire: questionnaire,
      };
      persist();
    }
    await call('answer', state.local.answer, validDraft);
    return resume(); // Reconcile instead of replacing a newer draft with an old replay.
  }
  function clear() {
    state.local = null;
    state.draft = null;
    try {
      options.storage.removeItem(STORAGE_KEY);
    } catch (e) {
      state.storageAvailable = false;
    }
  }
  read();
  return { state: state, capture: capture, resume: resume, answer: answer, clear: clear };
}
module.exports = {
  AUDIENCES: AUDIENCES,
  QUESTIONS: QUESTIONS,
  timing: timing,
  STORAGE_KEY: STORAGE_KEY,
  CAPABILITY: CAPABILITY,
  audienceForPath: audienceForPath,
  isIntakeRoute: isIntakeRoute,
  isJoinHost: isJoinHost,
  createCapability: createCapability,
  buildContact: buildContact,
  buildQuestionnaire: buildQuestionnaire,
  validDraft: validDraft,
  validReceipt: validReceipt,
  errorCopy: errorCopy,
  createIntake: createIntake,
};
