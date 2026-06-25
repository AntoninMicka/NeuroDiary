export class DiaryRepository {
  loadState() {
    throw new Error("DiaryRepository.loadState must be implemented");
  }

  saveState(_state) {
    throw new Error("DiaryRepository.saveState must be implemented");
  }

  resetState() {
    throw new Error("DiaryRepository.resetState must be implemented");
  }
}
