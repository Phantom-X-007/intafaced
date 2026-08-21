/**
 * connect.data-lake Stage-1 operator board — capture + batch + retention honesty.
 */

import { describeCapturePolicy } from './capture-policy.js';
import { describeIngestCaptureLakeBatch } from './ingest-capture-lake-batch.js';
import { describeDataLakeRetention } from './retention-policy.js';

export type DataLakeStage1Summary = {
  readonly capture: ReturnType<typeof describeCapturePolicy>;
  readonly batch: ReturnType<typeof describeIngestCaptureLakeBatch>;
  readonly retention: ReturnType<typeof describeDataLakeRetention>;
};

/** Single honesty board for connect.data-lake Stage-1 (no TSDB write). */
export function describeDataLakeStage1(env: NodeJS.ProcessEnv = process.env): DataLakeStage1Summary {
  return {
    capture: describeCapturePolicy(),
    batch: describeIngestCaptureLakeBatch(env),
    retention: describeDataLakeRetention(env),
  };
}
