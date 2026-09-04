import { createInitialState, normalizeState } from "../domain/diary.js";
import { DiaryRepository } from "./DiaryRepository.js";

export class MemoryDiaryRepository extends DiaryRepository {
  static async create(onProgress = null) {
    onProgress?.("Pro tuto roli používám dočasné úložiště bez zápisu do prohlížeče.");
    return new MemoryDiaryRepository();
  }

  constructor() {
    super();
    this.state = normalizeState(createInitialState());
  }

  getMode() {
    return "memory";
  }

  loadState() {
    return normalizeState(structuredClone(this.state));
  }

  saveState(state) {
    this.state = normalizeState(structuredClone(state));
  }

  resetState() {
    this.state = normalizeState(createInitialState());
    return this.loadState();
  }
}
