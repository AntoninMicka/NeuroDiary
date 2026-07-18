import { createDemoState, normalizeState } from "../domain/diary.js";
import { DiaryRepository } from "./DiaryRepository.js";

const STORAGE_KEY = "neurodiary-vue-poc-v1";

export class LocalStorageDiaryRepository extends DiaryRepository {
  static async create(onProgress = null) {
    onProgress?.("Preparing localStorage fallback repository.");
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
    this.onProgress?.("Loading application state from localStorage.");
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      this.onProgress?.("No localStorage data found. Generating initial demo data.");
      const initialState = normalizeState(createDemoState());
      this.saveState(initialState);
      return initialState;
    }

    try {
      this.onProgress?.("Existing localStorage data found. Parsing persisted state.");
      return normalizeState(JSON.parse(raw));
    } catch {
      this.onProgress?.("Stored localStorage data is invalid. Replacing it with demo data.");
      const initialState = normalizeState(createDemoState());
      this.saveState(initialState);
      return initialState;
    }
  }

  saveState(state) {
    this.onProgress?.("Persisting state into localStorage.");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  resetState() {
    const state = createDemoState();
    this.saveState(state);
    return state;
  }
}
