/**
 * One mounted alert sweep pass — shared by the boot driver and the interval.
 *
 * The interval alone left active watches unevaluated for up to
 * `ALERT_SWEEP_INTERVAL_MS` after boot and made `/ready.sweep.lastAt` read as
 * "never ran" until the first tick. Both are the same Class B shape: evaluation
 * promised, first pass delayed.
 */

import type { AlertService, AlertSweepReport } from './service.js';

export type AlertSweepRecorder = {
  readonly onComplete: (report: AlertSweepReport, at: Date) => void;
  readonly onError: (err: unknown) => void;
};

export async function runAlertSweepPass(alerts: AlertService, recorder: AlertSweepRecorder): Promise<void> {
  try {
    const report = await alerts.evaluateDueAlerts();
    recorder.onComplete(report, new Date());
  } catch (err) {
    recorder.onError(err);
  }
}
