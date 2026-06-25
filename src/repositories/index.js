import { LocalStorageDiaryRepository } from "./LocalStorageDiaryRepository.js";

export function createDiaryRepository() {
  return new LocalStorageDiaryRepository();
}
