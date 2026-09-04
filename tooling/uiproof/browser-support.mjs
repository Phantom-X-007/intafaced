/**
 * remaining-SOT §12.6 / §19.7.8 — browser-support policy (executable).
 *
 * This file names the engines. It does not install them, and it does not
 * enable Playwright projects. Lab/PR stays chromium-only until a later
 * field/lab change turns Firefox/WebKit on explicitly.
 *
 * WCAG and Axe are accessibility gates. They are not browser certification.
 */

export const POLICY_REFS = Object.freeze(['remaining-SOT §12.6', 'remaining-SOT §19.7.8']);

/** Minimum matrix remaining-SOT proposed: current Playwright engine equivalents. */
export const SUPPORTED_ENGINES = Object.freeze([
  {
    id: 'chromium',
    playwrightProject: 'chromium',
    label: 'current Chromium equivalent used by Playwright',
  },
  {
    id: 'firefox',
    playwrightProject: 'firefox',
    label: 'current Firefox equivalent used by Playwright',
  },
  {
    id: 'webkit',
    playwrightProject: 'webkit',
    label: 'current WebKit equivalent used by Playwright',
  },
]);

/** What uiproof actually launches today. Named engines above are not enabled. */
export const LAB_PLAYWRIGHT_PROJECTS = Object.freeze(['chromium']);

/** Explicitly not a browser-support signal. */
export const NOT_BROWSER_CERTIFICATION = Object.freeze(['WCAG', 'Axe', 'axe-core']);

/**
 * Playwright projects the lab config may enable.
 * Installed Firefox/WebKit must not silently appear here.
 */
export function playwrightProjectsForConfig(_installed = []) {
  return [...LAB_PLAYWRIGHT_PROJECTS];
}

export function isBrowserCertification(name) {
  if (typeof name !== 'string' || name.trim() === '') return false;
  const needle = name.trim().toLowerCase();
  if (NOT_BROWSER_CERTIFICATION.some((item) => item.toLowerCase() === needle)) return false;
  return SUPPORTED_ENGINES.some((engine) => engine.id === needle || engine.playwrightProject === needle);
}
