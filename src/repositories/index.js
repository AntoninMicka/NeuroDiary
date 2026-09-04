import { LocalStorageDiaryRepository } from "./LocalStorageDiaryRepository.js";
import { SqliteDiaryRepository } from "./SqliteDiaryRepository.js";
import { MemoryDiaryRepository } from "./MemoryDiaryRepository.js";

const SQLITE_INIT_TIMEOUT_MS = 4000;

function shouldSkipSqlite() {
  const hostname = globalThis.location?.hostname ?? "";
  const userAgent = globalThis.navigator?.userAgent ?? "";
  const isFirefox = /Firefox\/\d+/i.test(userAgent);
  const isLocalhost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost");

  if (isFirefox) {
    return {
      skip: true,
      reason: isLocalhost
        ? "Byl zjištěn místní režim Firefoxu. Inicializace sql.js WebAssembly byla kvůli spolehlivosti přeskočena."
        : "Byl zjištěn hostovaný režim Firefoxu. Inicializace sql.js WebAssembly byla kvůli spolehlivosti přeskočena.",
    };
  }

  return {
    skip: false,
    reason: "",
  };
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then((value) => {
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        globalThis.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export async function createDiaryRepository(options = {}) {
  const { onProgress, namespace = "guest", persistent = true } = options;
  if (!persistent) {
    return MemoryDiaryRepository.create(onProgress);
  }
  const sqliteDecision = shouldSkipSqlite();

  if (sqliteDecision.skip) {
    onProgress?.(sqliteDecision.reason);
    onProgress?.("Přepínám přímo na záložní úložiště localStorage.");
    const repository = await LocalStorageDiaryRepository.create(onProgress, namespace);
    repository.bootstrapWarning =
      "SQLite/WASM byl v hostovanem Firefoxu preskocen kvuli spolehlivosti. Aplikace bezi v localStorage rezimu.";
    return repository;
  }

  try {
    onProgress?.("Nejprve zkouším úložiště SQLite.");
    return await withTimeout(
      SqliteDiaryRepository.create(onProgress, namespace),
      SQLITE_INIT_TIMEOUT_MS,
      `Inicializace úložiště SQLite překročila limit ${SQLITE_INIT_TIMEOUT_MS} ms.`,
    );
  } catch (error) {
    console.warn("SQLite repository initialization failed, falling back to localStorage", error);
    const reason = error instanceof Error ? error.message : String(error);
    onProgress?.(`Úložiště SQLite selhalo: ${reason}`);
    onProgress?.("Přepínám na záložní úložiště localStorage.");
    const repository = await LocalStorageDiaryRepository.create(onProgress, namespace);
    repository.bootstrapWarning =
      `SQLite uloziste se nepodarilo spustit: ${reason}. Aplikace proto bezí v nouzovem localStorage rezimu.`;
    return repository;
  }
}
