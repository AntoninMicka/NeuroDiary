import { LocalStorageDiaryRepository } from "./LocalStorageDiaryRepository.js";
import { SqliteDiaryRepository } from "./SqliteDiaryRepository.js";

const SQLITE_INIT_TIMEOUT_MS = 4000;

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

export async function createDiaryRepository() {
  try {
    return await withTimeout(
      SqliteDiaryRepository.create(),
      SQLITE_INIT_TIMEOUT_MS,
      `SQLite repository initialization timed out after ${SQLITE_INIT_TIMEOUT_MS} ms.`,
    );
  } catch (error) {
    console.warn("SQLite repository initialization failed, falling back to localStorage", error);
    const repository = await LocalStorageDiaryRepository.create();
    const reason = error instanceof Error ? error.message : String(error);
    repository.bootstrapWarning =
      `SQLite uloziste se nepodarilo spustit: ${reason}. Aplikace proto bezí v nouzovem localStorage rezimu.`;
    return repository;
  }
}
