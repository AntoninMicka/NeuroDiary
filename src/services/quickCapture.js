export const QUICK_CAPTURE_WINDOW_MS = 10 * 60 * 60 * 1000;

export function isQuickCaptureDateValid(recordedAt, now = new Date()) {
  const timestamp = recordedAt?.getTime();
  const nowTimestamp = now?.getTime();

  return Number.isFinite(timestamp)
    && Number.isFinite(nowTimestamp)
    && timestamp >= nowTimestamp - QUICK_CAPTURE_WINDOW_MS
    && timestamp <= nowTimestamp;
}
