/**
 * @intafaced/connect-data-lake — Stage-1 in-process capture log (§27:762).
 *
 * Not a time-series store. Unconnected venues are absent, never empty books.
 */
export {
  CaptureLog,
  bookLevelsFromCapture,
  classifyBookObservation,
  isAbsentCapture,
  isMeasuredBook,
  type AbsentCapture,
  type AbsentReason,
  type BookObservation,
  type CaptureClock,
  type CaptureKind,
  type CaptureRecord,
  type FillObservation,
  type MeasuredBook,
  type MeasuredFill,
  type MeasuredTick,
  type TickObservation,
  type VenueConnection,
  type WireLevel,
} from './capture.js';
