import { createInitialState, normalizeState } from "../domain/diary.js";
import { DiaryRepository } from "./DiaryRepository.js";

const STORAGE_KEY = "neurodiary-vue-poc-v1";

export class LocalStorageDiaryRepository extends DiaryRepository {
  static async create(onProgress = null, namespace = "guest") {
    onProgress?.("Připravuji záložní úložiště localStorage.");
    return new LocalStorageDiaryRepository(onProgress, namespace);
  }

  constructor(onProgress = null, namespace = "guest") {
    super();
    this.onProgress = onProgress;
    this.storageKey = `${STORAGE_KEY}:${encodeURIComponent(namespace)}`;
    if (!localStorage.getItem(this.storageKey)) {
      try {
        const legacyRaw = localStorage.getItem(STORAGE_KEY);
        const legacyState = legacyRaw ? normalizeState(JSON.parse(legacyRaw)) : null;
        const legacyOwner = legacyState?.account?.userId || "guest";
        if (legacyState && legacyOwner === namespace) localStorage.setItem(this.storageKey, legacyRaw);
      } catch {
        // Invalid legacy data is ignored; loadState creates a clean namespaced diary.
      }
    }
  }

  getMode() {
    return "local";
  }

  loadState() {
    this.onProgress?.("Načítám stav aplikace z localStorage.");
    const raw = localStorage.getItem(this.storageKey);
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
    localStorage.setItem(this.storageKey, JSON.stringify(state));
  }

  resetState() {
    const state = normalizeState(createInitialState());
    this.saveState(state);
    return state;
  }
}
