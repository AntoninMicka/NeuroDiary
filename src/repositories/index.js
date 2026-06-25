import { LocalStorageDiaryRepository } from "./LocalStorageDiaryRepository.js";
import { SqliteDiaryRepository } from "./SqliteDiaryRepository.js";

export async function createDiaryRepository() {
  try {
    return await SqliteDiaryRepository.create();
  } catch (error) {
    console.warn("SQLite repository initialization failed, falling back to localStorage", error);
    return new LocalStorageDiaryRepository();
  }
}
