import { createDefaultEntry, createInitialState, normalizeState } from "../domain/diary.js";
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
      return normalizeState(createInitialState());
    }

    try {
      return normalizeState(JSON.parse(raw));
    } catch {
      return normalizeState(createInitialState());
    }
  }

  saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  resetState() {
    const state = createInitialState();
    state.entries[state.selectedDate] = createDefaultEntry();
    this.saveState(state);
    return state;
  }
}
