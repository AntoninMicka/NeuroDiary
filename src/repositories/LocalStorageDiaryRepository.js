import { createInitialState, normalizeState } from "../domain/diary.js";
import { DiaryRepository } from "./DiaryRepository.js";

const STORAGE_KEY = "neurodiary-vue-poc-v1";

export class LocalStorageDiaryRepository extends DiaryRepository {
  static async create(onProgress = null) {
    onProgress?.("Připravuji záložní úložiště localStorage.");
    return new LocalStorageDiaryRepository(onProgress);
  }

  constructor(onProgress = null) {
    super();
    this.onProgress = onProgress;
  }

  getMode() {
    return "local";
  }

  loadState() {
    this.onProgress?.("Načítám stav aplikace z localStorage.");
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      this.onProgress?.("V localStorage nebyla nalezena data. Vytvářím prázdný místní deník.");
      const initialState = normalizeState(createInitialState());
      this.saveState(initialState);
      return initialState;
    }

    try {
      this.onProgress?.("Byla nalezena data v localStorage. Načítám uložený stav.");
      return normalizeState(JSON.parse(raw));
    } catch {
      this.onProgress?.("Data v localStorage nejsou platná. Nahrazuji je prázdným deníkem.");
      const initialState = normalizeState(createInitialState());
      this.saveState(initialState);
      return initialState;
    }
  }

  saveState(state) {
    this.onProgress?.("Ukládám stav do localStorage.");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  resetState() {
    const state = normalizeState(createInitialState());
    this.saveState(state);
    return state;
  }
}
