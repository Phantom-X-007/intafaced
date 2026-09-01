/** Pure proof-result policy, kept separate so stale-evidence behavior is testable. */

export function findResult(playwrightReport, routeId, viewportName) {
  if (!playwrightReport?.suites) return null;
  const needle = `${routeId} @ ${viewportName}`;
  const stack = [...playwrightReport.suites];

  while (stack.length) {
    const suite = stack.pop();
    if (suite.suites) stack.push(...suite.suites);
    for (const spec of suite.specs || []) {
      if (!String(spec.title).includes(needle)) continue;

      const tests = spec.tests || [];
      const results = tests.flatMap((test) => test.results || []);
      const statuses = results.map((result) => result.status).filter(Boolean);
      const passed = spec.ok === true && tests.length > 0 && results.length > 0 && statuses.every((status) => status === 'passed');
      const projects = [...new Set(tests.map((test) => test.projectName).filter(Boolean))];
      return { passed, projects, statuses };
    }
  }
  return null;
}

export function evaluateCell(playwrightReport, result, hasScreenshot) {
  if (!playwrightReport) return { status: 'FAIL', detail: 'no playwright report' };
  if (!result) return { status: 'FAIL', detail: 'no matching test result' };
  if (!result.passed) return { status: 'FAIL', detail: 'playwright did not pass' };
  if (!hasScreenshot) return { status: 'FAIL', detail: 'missing screenshot' };
  return { status: 'PASS', detail: 'current test passed with screenshot' };
}
