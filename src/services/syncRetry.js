export const SYNC_RETRY_BASE_DELAY_MS = 5_000;
export const SYNC_RETRY_MAX_DELAY_MS = 5 * 60_000;

export function getSyncRetryDelay(
  failureCount,
  {
    baseDelayMs = SYNC_RETRY_BASE_DELAY_MS,
    maxDelayMs = SYNC_RETRY_MAX_DELAY_MS,
  } = {},
) {
  const normalizedFailureCount = Math.max(1, Number(failureCount) || 1);
  return Math.min(baseDelayMs * (2 ** (normalizedFailureCount - 1)), maxDelayMs);
}

export function createSyncRetryScheduler({
  task,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
  baseDelayMs = SYNC_RETRY_BASE_DELAY_MS,
  maxDelayMs = SYNC_RETRY_MAX_DELAY_MS,
}) {
  let timerId = null;
  let failureCount = 0;

  async function run() {
    timerId = null;
    let succeeded = false;
    try {
      succeeded = await task() === true;
    } catch {
      succeeded = false;
    }

    if (succeeded) {
      failureCount = 0;
      return true;
    }

    failureCount += 1;
    schedule(getSyncRetryDelay(failureCount, { baseDelayMs, maxDelayMs }));
    return false;
  }

  function schedule(delayMs = 0) {
    if (timerId !== null) {
      clearTimer(timerId);
    }
    timerId = setTimer(() => void run(), Math.max(0, delayMs));
  }

  function cancel() {
    if (timerId !== null) {
      clearTimer(timerId);
      timerId = null;
    }
  }

  return {
    cancel,
    run,
    schedule,
    getFailureCount: () => failureCount,
  };
}
