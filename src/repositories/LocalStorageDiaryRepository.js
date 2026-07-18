import { createDemoState, normalizeState } from "../domain/diary.js";
import { DiaryRepository } from "./DiaryRepository.js";

const STORAGE_KEY = "neurodiary-vue-poc-v1";

export class LocalStorageDiaryRepository extends DiaryRepository {
  static async create() {
    return new LocalStorageDiaryRepository();
  }

  getMode() {
    return "local";
  }

  loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initialState = normalizeState(createDemoState());
      this.saveState(initialState);
      return initialState;
    }

    try {
      return normalizeState(JSON.parse(raw));
    } catch {
      const initialState = normalizeState(createDemoState());
      this.saveState(initialState);
      return initialState;
    }
  }

  saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  resetState() {
    const state = createDemoState();
    this.saveState(state);
    return state;
  }
}
