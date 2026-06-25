import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import {
  createDefaultEntry,
  createDefaultHours,
  createInitialState,
  ensureEntry,
  normalizeState,
} from "../domain/diary.js";
import { DiaryRepository } from "./DiaryRepository.js";

const STORAGE_KEY = "neurodiary-sqlite-db-v1";

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export class SqliteDiaryRepository extends DiaryRepository {
  constructor(SQL, db) {
    super();
    this.SQL = SQL;
    this.db = db;
    this.ensureSchema();
  }

  static async create() {
    const SQL = await initSqlJs({
      locateFile: () => wasmUrl,
    });

    const raw = localStorage.getItem(STORAGE_KEY);
    const db = raw ? new SQL.Database(base64ToBytes(raw)) : new SQL.Database();
    return new SqliteDiaryRepository(SQL, db);
  }

  ensureSchema() {
    this.db.run(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS diary_entries (
        entry_date TEXT PRIMARY KEY,
        sleep_quality TEXT NOT NULL,
        overall_status TEXT NOT NULL,
        notes TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS medications (
        id TEXT PRIMARY KEY,
        entry_date TEXT NOT NULL,
        name TEXT NOT NULL,
        dose TEXT NOT NULL,
        time TEXT NOT NULL,
        FOREIGN KEY (entry_date) REFERENCES diary_entries(entry_date) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS hourly_states (
        entry_date TEXT NOT NULL,
        hour_label TEXT NOT NULL,
        state_key TEXT NOT NULL,
        PRIMARY KEY (entry_date, hour_label),
        FOREIGN KEY (entry_date) REFERENCES diary_entries(entry_date) ON DELETE CASCADE
      );
    `);
  }

  loadState() {
    const state = createInitialState();
    const selectedDate = this.selectSetting("selected_date");
    if (selectedDate) {
      state.selectedDate = selectedDate;
    }

    const entries = this.db.exec(`
      SELECT entry_date, sleep_quality, overall_status, notes
      FROM diary_entries
      ORDER BY entry_date
    `);

    if (entries[0]) {
      for (const [entryDate, sleepQuality, overallStatus, notes] of entries[0].values) {
        state.entries[entryDate] = {
          sleepQuality,
          overallStatus,
          notes,
          medications: this.selectMedications(entryDate),
          hours: this.selectHours(entryDate),
        };
      }
    }

    ensureEntry(state, state.selectedDate);
    return normalizeState(state);
  }

  saveState(state) {
    this.db.run("BEGIN");

    try {
      this.db.run("DELETE FROM app_settings");
      this.db.run("DELETE FROM medications");
      this.db.run("DELETE FROM hourly_states");
      this.db.run("DELETE FROM diary_entries");

      this.db.run("INSERT INTO app_settings (key, value) VALUES (?, ?)", [
        "selected_date",
        state.selectedDate,
      ]);

      for (const [entryDate, entry] of Object.entries(state.entries)) {
        this.db.run(
          `
            INSERT INTO diary_entries (entry_date, sleep_quality, overall_status, notes)
            VALUES (?, ?, ?, ?)
          `,
          [entryDate, entry.sleepQuality, entry.overallStatus, entry.notes],
        );

        for (const medication of entry.medications) {
          this.db.run(
            `
              INSERT INTO medications (id, entry_date, name, dose, time)
              VALUES (?, ?, ?, ?, ?)
            `,
            [medication.id, entryDate, medication.name, medication.dose, medication.time],
          );
        }

        for (const [hourLabel, stateKey] of Object.entries(entry.hours)) {
          this.db.run(
            `
              INSERT INTO hourly_states (entry_date, hour_label, state_key)
              VALUES (?, ?, ?)
            `,
            [entryDate, hourLabel, stateKey],
          );
        }
      }

      this.db.run("COMMIT");
      this.persistDatabase();
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
  }

  resetState() {
    this.db.close();
    this.db = new this.SQL.Database();
    this.ensureSchema();

    const state = createInitialState();
    state.entries[state.selectedDate] = createDefaultEntry();
    this.saveState(state);
    return state;
  }

  persistDatabase() {
    const exported = this.db.export();
    localStorage.setItem(STORAGE_KEY, bytesToBase64(exported));
  }

  selectSetting(key) {
    const statement = this.db.prepare("SELECT value FROM app_settings WHERE key = ?");
    try {
      statement.bind([key]);
      if (statement.step()) {
        return statement.getAsObject().value;
      }
      return null;
    } finally {
      statement.free();
    }
  }

  selectMedications(entryDate) {
    const statement = this.db.prepare(`
      SELECT id, name, dose, time
      FROM medications
      WHERE entry_date = ?
      ORDER BY time, id
    `);

    try {
      statement.bind([entryDate]);
      const results = [];
      while (statement.step()) {
        const row = statement.getAsObject();
        results.push({
          id: row.id,
          name: row.name,
          dose: row.dose,
          time: row.time,
        });
      }
      return results;
    } finally {
      statement.free();
    }
  }

  selectHours(entryDate) {
    const statement = this.db.prepare(`
      SELECT hour_label, state_key
      FROM hourly_states
      WHERE entry_date = ?
      ORDER BY hour_label
    `);

    try {
      statement.bind([entryDate]);
      const results = {};
      while (statement.step()) {
        const row = statement.getAsObject();
        results[row.hour_label] = row.state_key;
      }
      return Object.keys(results).length > 0 ? results : createDefaultHours();
    } finally {
      statement.free();
    }
  }
}
