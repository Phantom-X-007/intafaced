import assert from 'node:assert/strict';
import { evaluateCell, findResult } from './report-policy.mjs';

const report = {
  suites: [
    {
      specs: [
        {
          title: 'exchange @ mobile (/exchange)',
          ok: true,
          tests: [{ projectName: 'chromium', results: [{ status: 'passed' }] }],
        },
        { title: 'empty @ mobile (/empty)', ok: true, tests: [] },
        {
          title: 'failed @ mobile (/failed)',
          ok: false,
          tests: [{ projectName: 'chromium', results: [{ status: 'failed' }] }],
        },
      ],
    },
  ],
};

const passed = findResult(report, 'exchange', 'mobile');
assert.equal(passed.passed, true);
assert.deepEqual(passed.projects, ['chromium']);
assert.deepEqual(evaluateCell(report, passed, true), {
  status: 'PASS',
  detail: 'current test passed with screenshot',
});
assert.equal(evaluateCell(null, null, true).status, 'FAIL', 'a stale shot cannot pass without a report');
assert.equal(evaluateCell(report, passed, false).status, 'FAIL', 'a passing test still needs its shot');
assert.equal(findResult(report, 'empty', 'mobile').passed, false, 'empty test arrays never pass vacuously');
assert.equal(findResult(report, 'failed', 'mobile').passed, false);
assert.equal(evaluateCell(report, null, true).status, 'FAIL');

console.log('uiproof report policy: ok');
