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
      const demoState = normalizeState(createDemoState());
      this.saveState(demoState);
      return demoState;
    }

    try {
      return normalizeState(JSON.parse(raw));
    } catch {
      const demoState = normalizeState(createDemoState());
      this.saveState(demoState);
      return demoState;
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
