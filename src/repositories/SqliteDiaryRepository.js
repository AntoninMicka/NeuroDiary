import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import {
  createDefaultHours,
  createInitialState,
  createTreatmentPlanItem,
  ensureEntry,
  UNDEFINED_ENTRY_VALUE,
  normalizeEntryHourRecords,
  normalizeState,
  reconcileEntryHourState,
} from "../domain/diary.js";
import { DiaryRepository } from "./DiaryRepository.js";

const STORAGE_KEY = "neurodiary-sqlite-db-v1";
const SCHEMA_VERSION = 6;

const MIGRATIONS = [
  {
    version: 1,
    run(db) {
      db.run(`
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
    },
  },
  {
    version: 2,
    run(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS hourly_state_records (
          id TEXT PRIMARY KEY,
          entry_date TEXT NOT NULL,
          hour_label TEXT NOT NULL,
          state_key TEXT NOT NULL,
          recorded_at TEXT NOT NULL,
          source TEXT NOT NULL,
          FOREIGN KEY (entry_date) REFERENCES diary_entries(entry_date) ON DELETE CASCADE
        );
      `);
    },
  },
  {
    version: 3,
    run(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS treatment_plan (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          dose TEXT NOT NULL,
          time TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 4,
    run(db) {
      db.run(`
        ALTER TABLE diary_entries ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
      `);
    },
  },
  {
    version: 5,
    run(db) {
      db.run(`
        ALTER TABLE medications ADD COLUMN plan_item_id TEXT NOT NULL DEFAULT '';
      `);
    },
  },
  {
    version: 6,
    run(db) {
      db.run(`
        ALTER TABLE treatment_plan ADD COLUMN valid_from TEXT NOT NULL DEFAULT '';
        ALTER TABLE treatment_plan ADD COLUMN valid_to TEXT NOT NULL DEFAULT '';
      `);
    },
  },
];

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

function cloneSerializable(value) {
  return JSON.parse(JSON.stringify(value));
}

export class SqliteDiaryRepository extends DiaryRepository {
  constructor(SQL, db, onProgress = null) {
    super();
    this.onProgress = onProgress;
    this.SQL = SQL;
    this.db = db;
    this.reportProgress("SQLite engine ready. Enabling foreign keys.");
    this.enableForeignKeys();
    this.reportProgress("Running SQLite schema migrations.");
    this.runMigrations();
  }

  static async create(onProgress = null) {
    onProgress?.("Loading sql.js WebAssembly runtime.");
    const SQL = await initSqlJs({
      locateFile: () => wasmUrl,
    });

    onProgress?.("Checking existing local SQLite database.");
    const raw = localStorage.getItem(STORAGE_KEY);
    onProgress?.(raw ? "Opening persisted SQLite database." : "Creating a new SQLite database.");
    const db = raw ? new SQL.Database(base64ToBytes(raw)) : new SQL.Database();
    return new SqliteDiaryRepository(SQL, db, onProgress);
  }

  getMode() {
    return "sqlite";
  }

  supportsBinaryImportExport() {
    return true;
  }

  enableForeignKeys() {
    this.db.run("PRAGMA foreign_keys = ON");
  }

  reportProgress(message) {
    this.onProgress?.(message);
  }

  runMigrations() {
    const currentVersion = this.readUserVersion();
    this.reportProgress(`Current SQLite schema version is ${currentVersion}.`);
    if (currentVersion > SCHEMA_VERSION) {
      throw new Error(
        `Database schema version ${currentVersion} is newer than supported version ${SCHEMA_VERSION}.`,
      );
    }

    this.db.run("BEGIN");
    try {
      for (const migration of MIGRATIONS) {
        if (migration.version > currentVersion) {
          this.reportProgress(`Applying SQLite migration v${migration.version}.`);
          migration.run(this.db);
          this.db.run(`PRAGMA user_version = ${migration.version}`);
        }
      }
      this.db.run("COMMIT");
      this.enableForeignKeys();
      this.reportProgress("Persisting migrated SQLite database.");
      this.persistDatabase();
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
  }

  loadState() {
    this.reportProgress("Loading application state from SQLite.");
    const state = createInitialState();
    const selectedDate = this.selectSetting("selected_date");
    const patientName = this.selectSetting("patient_name");
    const birthYear = this.selectSetting("birth_year");
    const accountJson = this.selectSetting("account_json");
    const deletedEntryDatesJson = this.selectSetting("deleted_entry_dates_json");
    const deletedMedicationIdsJson = this.selectSetting("deleted_medication_ids_json");
    state.treatmentPlan = this.selectTreatmentPlan();
    if (selectedDate) {
      state.selectedDate = selectedDate;
    }
    if (patientName) {
      state.patientName = patientName;
    }
    if (birthYear) {
      state.birthYear = birthYear;
    }
    if (accountJson) {
      try {
        state.account = JSON.parse(accountJson);
      } catch {
        state.account = createInitialState().account;
      }
    }
    if (deletedEntryDatesJson) {
      try {
        state.deletedEntryDates = JSON.parse(deletedEntryDatesJson);
      } catch {
        state.deletedEntryDates = {};
      }
    }
    if (deletedMedicationIdsJson) {
      try {
        state.deletedMedicationIds = JSON.parse(deletedMedicationIdsJson);
      } catch {
        state.deletedMedicationIds = {};
      }
    }

    const entries = this.db.exec(`
      SELECT entry_date, sleep_quality, overall_status, notes, updated_at
      FROM diary_entries
      ORDER BY entry_date
    `);

    if (entries[0]) {
      this.reportProgress(`Found ${entries[0].values.length} SQLite diary entries.`);
      for (const [entryDate, sleepQuality, overallStatus, notes, updatedAt] of entries[0].values) {
        state.entries[entryDate] = {
          sleepQuality: sleepQuality || UNDEFINED_ENTRY_VALUE,
          overallStatus: overallStatus || UNDEFINED_ENTRY_VALUE,
          notes,
          updatedAt: updatedAt || "",
          medications: this.selectMedications(entryDate),
          hours: this.selectHours(entryDate),
          hourRecords: this.selectHourRecords(entryDate),
        };
      }
    } else {
      this.reportProgress("SQLite database is empty. Creating an empty diary.");
      const initialState = normalizeState(createInitialState());
      this.saveState(initialState);
      return initialState;
    }

    this.reportProgress("SQLite state loaded successfully.");
    ensureEntry(state, state.selectedDate);
    return normalizeState(state);
  }

  saveState(state) {
      this.db.run("BEGIN");

    try {
      this.db.run("DELETE FROM app_settings");
      this.db.run("DELETE FROM treatment_plan");
      this.db.run("DELETE FROM medications");
      this.db.run("DELETE FROM hourly_state_records");
      this.db.run("DELETE FROM hourly_states");
      this.db.run("DELETE FROM diary_entries");

      this.db.run("INSERT INTO app_settings (key, value) VALUES (?, ?)", [
        "selected_date",
        state.selectedDate,
      ]);
      this.db.run("INSERT INTO app_settings (key, value) VALUES (?, ?)", [
        "patient_name",
        state.patientName ?? "",
      ]);
      this.db.run("INSERT INTO app_settings (key, value) VALUES (?, ?)", [
        "birth_year",
        state.birthYear ?? "",
      ]);
      this.db.run("INSERT INTO app_settings (key, value) VALUES (?, ?)", [
        "account_json",
        JSON.stringify(state.account ?? createInitialState().account),
      ]);
      this.db.run("INSERT INTO app_settings (key, value) VALUES (?, ?)", [
        "deleted_entry_dates_json",
        JSON.stringify(state.deletedEntryDates ?? {}),
      ]);
      this.db.run("INSERT INTO app_settings (key, value) VALUES (?, ?)", [
        "deleted_medication_ids_json",
        JSON.stringify(state.deletedMedicationIds ?? {}),
      ]);

      for (const item of state.treatmentPlan ?? []) {
        this.db.run(
          `
            INSERT INTO treatment_plan (id, name, dose, time, valid_from, valid_to)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
          [item.id, item.name, item.dose, item.time, item.validFrom ?? "", item.validTo ?? ""],
        );
      }

      for (const [entryDate, entry] of Object.entries(state.entries)) {
        const normalizedEntry = reconcileEntryHourState(cloneSerializable(entry));
        this.db.run(
          `
            INSERT INTO diary_entries (entry_date, sleep_quality, overall_status, notes, updated_at)
            VALUES (?, ?, ?, ?, ?)
          `,
          [
            entryDate,
            normalizedEntry.sleepQuality,
            normalizedEntry.overallStatus,
            normalizedEntry.notes,
            normalizedEntry.updatedAt ?? "",
          ],
        );

        for (const medication of normalizedEntry.medications) {
          this.db.run(
            `
              INSERT INTO medications (id, entry_date, name, dose, time, plan_item_id)
              VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
              medication.id,
              entryDate,
              medication.name,
              medication.dose,
              medication.time,
              medication.planItemId ?? "",
            ],
          );
        }

        for (const [hourLabel, stateKey] of Object.entries(normalizedEntry.hours)) {
          if (!stateKey) {
            continue;
          }
          this.db.run(
            `
              INSERT INTO hourly_states (entry_date, hour_label, state_key)
              VALUES (?, ?, ?)
            `,
            [entryDate, hourLabel, stateKey],
          );
        }

        for (const [hourLabel, records] of Object.entries(normalizedEntry.hourRecords)) {
          for (const record of records) {
            this.db.run(
              `
                INSERT INTO hourly_state_records (id, entry_date, hour_label, state_key, recorded_at, source)
                VALUES (?, ?, ?, ?, ?, ?)
              `,
              [record.id, entryDate, hourLabel, record.stateKey, record.recordedAt, record.source],
            );
          }
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
    this.enableForeignKeys();
    this.runMigrations();

    const state = normalizeState(createInitialState());
    this.saveState(state);
    return state;
  }

  exportDatabase() {
    return this.db.export();
  }

  importDatabase(arrayBuffer) {
    const importedDb = new this.SQL.Database(new Uint8Array(arrayBuffer));
    const previousDb = this.db;

    try {
      this.db = importedDb;
      this.enableForeignKeys();
      this.runMigrations();
      const state = this.loadState();
      this.persistDatabase();
      previousDb.close();
      return state;
    } catch (error) {
      this.db = previousDb;
      importedDb.close();
      throw error;
    }
  }

  persistDatabase() {
    const exported = this.db.export();
    localStorage.setItem(STORAGE_KEY, bytesToBase64(exported));
  }

  readUserVersion() {
    return Number(this.readPragmaValue("user_version") ?? 0);
  }

  readPragmaValue(name) {
    const statement = this.db.prepare(`PRAGMA ${name}`);
    try {
      if (statement.step()) {
        const row = statement.getAsObject();
        const firstValue = Object.values(row)[0];
        return firstValue;
      }
      return null;
    } finally {
      statement.free();
    }
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
      SELECT id, name, dose, time, plan_item_id
      FROM medications
      WHERE entry_date = ?
      ORDER BY time, id
    `);

    try {
      statement.bind([entryDate]);
      const results = [];
      while (statement.step()) {
        const row = statement.getAsObject();
        const medication = {
          id: row.id,
          name: row.name,
          dose: row.dose,
          time: row.time,
        };
        if (row.plan_item_id) {
          medication.planItemId = row.plan_item_id;
        }
        results.push(medication);
      }
      return results;
    } finally {
      statement.free();
    }
  }

  selectTreatmentPlan() {
    const statement = this.db.prepare(`
      SELECT id, name, dose, time, valid_from, valid_to
      FROM treatment_plan
      ORDER BY time, id
    `);

    try {
      const results = [];
      while (statement.step()) {
        const row = statement.getAsObject();
        results.push(createTreatmentPlanItem({
          id: row.id,
          name: row.name,
          dose: row.dose,
          time: row.time,
          validFrom: row.valid_from,
          validTo: row.valid_to,
        }));
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

  selectHourRecords(entryDate) {
    const statement = this.db.prepare(`
      SELECT id, hour_label, state_key, recorded_at, source
      FROM hourly_state_records
      WHERE entry_date = ?
      ORDER BY hour_label, recorded_at, id
    `);

    try {
      statement.bind([entryDate]);
      const results = {};
      while (statement.step()) {
        const row = statement.getAsObject();
        if (!results[row.hour_label]) {
          results[row.hour_label] = [];
        }

        results[row.hour_label].push({
          id: row.id,
          stateKey: row.state_key,
          recordedAt: row.recorded_at,
          source: row.source,
        });
      }

      return normalizeEntryHourRecords(
        Object.keys(results).length > 0 ? results : null,
        this.selectHours(entryDate),
      );
    } finally {
      statement.free();
    }
  }
}
