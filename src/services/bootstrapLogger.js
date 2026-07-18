const BOOTSTRAP_LOG_EVENT = "neurodiary:bootstrap-log";
const STORE_KEY = "__neurodiaryBootstrapLog";

let entryCounter = 0;

function getStore() {
  if (!Array.isArray(globalThis[STORE_KEY])) {
    globalThis[STORE_KEY] = [];
  }

  return globalThis[STORE_KEY];
}

function formatTimestamp(date) {
  return new Intl.DateTimeFormat("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function appendBootstrapLog(message, level = "info") {
  const timestamp = new Date();
  const entry = {
    id: `bootstrap-${timestamp.getTime()}-${entryCounter += 1}`,
    atIso: timestamp.toISOString(),
    timeLabel: formatTimestamp(timestamp),
    message,
    level,
  };
  const store = getStore();
  store.push(entry);

  globalThis.dispatchEvent?.(
    new CustomEvent(BOOTSTRAP_LOG_EVENT, {
      detail: {
        entry,
        entries: [...store],
      },
    }),
  );

  return entry;
}

export function getBootstrapLogEntries() {
  return [...getStore()];
}

export function getLatestBootstrapLogEntry() {
  const store = getStore();
  return store.at(-1) ?? null;
}

export { BOOTSTRAP_LOG_EVENT };
