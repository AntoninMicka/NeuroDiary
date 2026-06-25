export class DiaryRepository {
  static async create() {
    throw new Error("DiaryRepository.create must be implemented");
  }

  getMode() {
    throw new Error("DiaryRepository.getMode must be implemented");
  }

  loadState() {
    throw new Error("DiaryRepository.loadState must be implemented");
  }

  saveState(_state) {
    throw new Error("DiaryRepository.saveState must be implemented");
  }

  resetState() {
    throw new Error("DiaryRepository.resetState must be implemented");
  }

  supportsBinaryImportExport() {
    return false;
  }

  exportDatabase() {
    throw new Error("DiaryRepository.exportDatabase must be implemented");
  }

  importDatabase(_arrayBuffer) {
    throw new Error("DiaryRepository.importDatabase must be implemented");
  }
}
