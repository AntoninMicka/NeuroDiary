import {
  formatLongDate,
  formatOverallStatus,
  formatSleepQuality,
  getStateDefinition,
  HOUR_STATES,
  summarizeHours,
  TRACKING_HOURS,
} from "../domain/diary.js";

const REPORT_DAYS_PAGE_ONE = 3;
const ANALYSIS_DAYS = 7;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shiftDateKey(dateKey, offsetDays) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function buildDateKeys(selectedDate, count) {
  return Array.from({ length: count }, (_, index) => shiftDateKey(selectedDate, index - count + 1));
}

function buildLegend() {
  return HOUR_STATES.map(
    (state) => `<li><strong>${escapeHtml(state.shortLabel)}</strong> ${escapeHtml(state.label)}</li>`,
  ).join("");
}

function buildMatrixRows(entry) {
  const movementStates = HOUR_STATES.filter((state) => state.key !== "sleep");

  const rows = movementStates.map((state) => {
    const cells = TRACKING_HOURS.map((hourLabel) => {
      const stateKey = entry?.hours?.[hourLabel];
      const marker = stateKey === state.key ? "X" : "";
      return `<td>${marker}</td>`;
    }).join("");

    return `
      <tr>
        <th>${escapeHtml(state.label)}</th>
        ${cells}
      </tr>
    `;
  });

  rows.push(`
    <tr>
      <th>Spanek</th>
      ${TRACKING_HOURS.map((hourLabel) => `<td>${entry?.hours?.[hourLabel] === "sleep" ? "S" : ""}</td>`).join("")}
    </tr>
  `);

  return rows.join("");
}

function buildMedicationTimelineRow(entry) {
  const medicationsByHour = new Map();

  for (const medication of entry?.medications ?? []) {
    const [hour] = medication.time.split(":");
    if (!medicationsByHour.has(hour)) {
      medicationsByHour.set(hour, []);
    }
    medicationsByHour.get(hour).push(`${medication.time} ${medication.name}`);
  }

  return TRACKING_HOURS.map((hourLabel) => {
    const items = medicationsByHour.get(hourLabel) ?? [];
    const content = items.length
      ? items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")
      : "";

    return `<td class="med-cell">${content}</td>`;
  }).join("");
}

function buildDayTable(dateKey, entry) {
  const note = entry?.notes?.trim() || "Bez poznamek.";

  return `
    <section class="day-sheet">
      <div class="day-heading">
        <div>
          <p class="day-title">${escapeHtml(formatLongDate(dateKey))}</p>
          <p class="day-subtitle">
            Spanek: ${escapeHtml(entry ? formatSleepQuality(entry.sleepQuality) : "Bez zaznamu")}
            · Den: ${escapeHtml(entry ? formatOverallStatus(entry.overallStatus) : "Bez zaznamu")}
          </p>
        </div>
      </div>

      <table class="diary-table">
        <thead>
          <tr>
            <th>Stav / Hod.</th>
            ${TRACKING_HOURS.map((hourLabel) => `<th>${escapeHtml(hourLabel)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${buildMatrixRows(entry)}
          <tr class="med-row">
            <th>Lecba</th>
            ${buildMedicationTimelineRow(entry)}
          </tr>
        </tbody>
      </table>

      <div class="day-note">
        <strong>Poznamka:</strong> ${escapeHtml(note)}
      </div>
    </section>
  `;
}

function collectEntries(entries, selectedDate, count) {
  return buildDateKeys(selectedDate, count).map((dateKey) => ({
    dateKey,
    entry: entries[dateKey],
  }));
}

function summarizeWindow(entries, selectedDate, count) {
  const items = collectEntries(entries, selectedDate, count).filter(({ entry }) => Boolean(entry));
  const stateTotals = HOUR_STATES.reduce((accumulator, state) => {
    accumulator[state.key] = 0;
    return accumulator;
  }, {});

  let totalMedicationDoses = 0;
  let daysWithData = 0;

  for (const { entry } of items) {
    const counts = summarizeHours(entry.hours);
    daysWithData += 1;
    totalMedicationDoses += entry.medications.length;

    for (const state of HOUR_STATES) {
      stateTotals[state.key] += counts[state.key] ?? 0;
    }
  }

  const dominantState = Object.entries(stateTotals).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "on";

  return {
    daysWithData,
    totalMedicationDoses,
    averageDoses: daysWithData ? (totalMedicationDoses / daysWithData).toFixed(1) : "0.0",
    dominantState: getStateDefinition(dominantState).label,
    sleepHours: stateTotals.sleep,
    onHours: stateTotals.on,
    offHours: stateTotals.off,
    partialHours: stateTotals.partial,
    dyskinesiaHours: stateTotals.dyskinesia,
  };
}

function buildTrendRows(entries, selectedDate) {
  return collectEntries(entries, selectedDate, ANALYSIS_DAYS)
    .reverse()
    .map(({ dateKey, entry }) => {
      if (!entry) {
        return `
          <tr>
            <td>${escapeHtml(formatLongDate(dateKey))}</td>
            <td colspan="4">Bez zaznamu</td>
          </tr>
        `;
      }

      const counts = summarizeHours(entry.hours);
      const dominantStateKey = Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "on";

      return `
        <tr>
          <td>${escapeHtml(formatLongDate(dateKey))}</td>
          <td>${escapeHtml(formatSleepQuality(entry.sleepQuality))}</td>
          <td>${escapeHtml(formatOverallStatus(entry.overallStatus))}</td>
          <td>${escapeHtml(getStateDefinition(dominantStateKey).label)}</td>
          <td>${escapeHtml(String(entry.medications.length))}</td>
        </tr>
      `;
    })
    .join("");
}

function buildHourSummaryRows(entries, selectedDate) {
  return TRACKING_HOURS.map((hourLabel) => {
    const counts = HOUR_STATES.reduce((accumulator, state) => {
      accumulator[state.key] = 0;
      return accumulator;
    }, {});

    for (const { entry } of collectEntries(entries, selectedDate, ANALYSIS_DAYS)) {
      const stateKey = entry?.hours?.[hourLabel];
      if (stateKey && counts[stateKey] !== undefined) {
        counts[stateKey] += 1;
      }
    }

    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const dominantStateKey = Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "on";
    const dominantState = getStateDefinition(dominantStateKey);
    const width = total ? Math.max((counts[dominantStateKey] / total) * 100, 10) : 0;

    return `
      <tr>
        <td>${escapeHtml(hourLabel)}:00</td>
        <td>${escapeHtml(dominantState.label)}</td>
        <td>
          <div class="bar-track">
            <div class="bar-fill state-${escapeHtml(dominantState.key)}" style="width: ${width}%;"></div>
          </div>
        </td>
        <td>${escapeHtml(`${counts.on} ON / ${counts.partial} MID / ${counts.off} OFF`)}</td>
      </tr>
    `;
  }).join("");
}

function buildAnalysisPage(entries, selectedDate) {
  const summary = summarizeWindow(entries, selectedDate, ANALYSIS_DAYS);

  return `
    <section class="sheet analysis-page">
      <header class="analysis-header">
        <div>
          <p class="section-label">Strana 2 · Nacrt analyz</p>
          <h2>Souhrn za poslednich ${ANALYSIS_DAYS} dni</h2>
          <p>Navrh dalsi reportove strany: rychly prehled trendu, stability a lecby.</p>
        </div>
      </header>

      <section class="analysis-cards">
        <article class="analysis-card">
          <strong>Dny se zaznamem</strong>
          <span>${escapeHtml(String(summary.daysWithData))} / ${ANALYSIS_DAYS}</span>
        </article>
        <article class="analysis-card">
          <strong>Prumer davek / den</strong>
          <span>${escapeHtml(String(summary.averageDoses))}</span>
        </article>
        <article class="analysis-card">
          <strong>Prevladajici stav</strong>
          <span>${escapeHtml(summary.dominantState)}</span>
        </article>
        <article class="analysis-card">
          <strong>Celkem hodin OFF</strong>
          <span>${escapeHtml(String(summary.offHours))}</span>
        </article>
      </section>

      <section class="analysis-grid">
        <article class="analysis-panel">
          <h3>Denni trend</h3>
          <table class="trend-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Spanek</th>
                <th>Den</th>
                <th>Prevladajici stav</th>
                <th>Davky</th>
              </tr>
            </thead>
            <tbody>${buildTrendRows(entries, selectedDate)}</tbody>
          </table>
        </article>

        <article class="analysis-panel">
          <h3>Hodinovy souhrn</h3>
          <table class="hour-summary-table">
            <thead>
              <tr>
                <th>Cas</th>
                <th>Nejcasteji</th>
                <th>Stabilita</th>
                <th>Poznamka</th>
              </tr>
            </thead>
            <tbody>${buildHourSummaryRows(entries, selectedDate)}</tbody>
          </table>
        </article>
      </section>
    </section>
  `;
}

export function buildDoctorReportHtml({ entries, selectedDate, patientName = "", birthYear = "" }) {
  const entry = entries[selectedDate];
  if (!entry) {
    throw new Error(`No diary entry found for ${selectedDate}`);
  }

  const generatedAt = new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  const dateKeys = buildDateKeys(selectedDate, REPORT_DAYS_PAGE_ONE);

  return `<!DOCTYPE html>
  <html lang="cs">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>NeuroDiary Report</title>
      <style>
        @page {
          size: A4 landscape;
          margin: 8mm;
        }
        :root {
          --blue: #315979;
          --blue-soft: #d9ebf8;
          --line: #9fb5c8;
          --line-soft: #d8e4ee;
          --text: #22313f;
          --muted: #5c7285;
          --on: #d9ebf8;
          --partial: #f8e7b7;
          --off: #f6c9c9;
          --dyskinesia: #ead8ff;
          --sleep: #e7edf2;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          color: var(--text);
          font-family: "Segoe UI", "Helvetica Neue", sans-serif;
          background: white;
        }
        .page {
          display: flex;
          flex-direction: column;
          gap: 10mm;
          width: 281mm;
          margin: 0 auto;
        }
        .sheet {
          border: 1.5px solid var(--blue);
          page-break-after: always;
          width: 100%;
          min-height: 194mm;
        }
        .sheet:last-child {
          page-break-after: auto;
        }
        .header {
          display: grid;
          grid-template-columns: 1.35fr 0.95fr;
          background: var(--blue);
          color: white;
        }
        .header-main {
          padding: 12px 14px;
        }
        .header-main h1 {
          margin: 0 0 5px;
          font-size: 22px;
          line-height: 1.08;
        }
        .header-main p {
          margin: 0;
          font-size: 12px;
        }
        .header-side {
          padding: 12px 14px;
          border-left: 1px solid rgba(255,255,255,0.25);
        }
        .header-side p {
          margin: 0 0 6px;
          font-size: 11px;
        }
        .header-side ul {
          margin: 6px 0 0 16px;
          padding: 0;
          font-size: 10px;
        }
        .meta {
          display: grid;
          grid-template-columns: 1.2fr 0.8fr 0.6fr 0.6fr;
          border-top: 1px solid var(--blue);
        }
        .meta-cell {
          min-height: 54px;
          padding: 8px 10px;
          border-right: 1px solid var(--line);
          background: var(--blue-soft);
        }
        .meta-cell:last-child {
          border-right: 0;
        }
        .meta-label,
        .section-label {
          display: block;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--blue);
          letter-spacing: 0.04em;
          margin: 0 0 4px;
        }
        .meta-value {
          font-size: 12px;
          font-weight: 600;
          line-height: 1.3;
        }
        .content,
        .analysis-page {
          padding: 10px;
        }
        .content-head {
          display: flex;
          justify-content: space-between;
          align-items: end;
          gap: 12px;
          margin-bottom: 8px;
        }
        .content-head strong,
        .analysis-card strong {
          display: block;
          color: var(--blue);
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.04em;
          margin-bottom: 3px;
        }
        .content-head span {
          font-size: 12px;
        }
        .day-sheet {
          margin-bottom: 8px;
          page-break-inside: avoid;
        }
        .day-sheet:last-of-type {
          margin-bottom: 0;
        }
        .day-heading {
          display: flex;
          justify-content: space-between;
          align-items: end;
          margin-bottom: 4px;
        }
        .day-title {
          margin: 0;
          font-size: 13px;
          font-weight: 700;
          color: var(--blue);
        }
        .day-subtitle {
          margin: 2px 0 0;
          font-size: 11px;
          color: var(--muted);
        }
        .diary-table,
        .trend-table,
        .hour-summary-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .diary-table th,
        .diary-table td,
        .trend-table th,
        .trend-table td,
        .hour-summary-table th,
        .hour-summary-table td {
          border: 1px solid var(--line);
          padding: 4px 2px;
          font-size: 10px;
          text-align: center;
          vertical-align: middle;
        }
        .diary-table thead th {
          background: var(--blue);
          color: white;
          font-weight: 700;
        }
        .diary-table tbody th {
          width: 134px;
          text-align: left;
          padding-left: 6px;
          background: #eef5fb;
          font-weight: 600;
        }
        .med-row th {
          background: #edf7f1 !important;
        }
        .med-cell {
          height: 34px;
          padding: 1px !important;
          font-size: 8px !important;
          line-height: 1.1;
        }
        .med-cell span {
          display: block;
          color: var(--blue);
        }
        .day-note {
          margin-top: 4px;
          border: 1px solid var(--line-soft);
          background: #fafcfe;
          padding: 5px 7px;
          font-size: 10px;
          line-height: 1.3;
        }
        .footer {
          margin-top: 8px;
          color: #587086;
          font-size: 12px;
        }
        .analysis-header h2 {
          margin: 0 0 4px;
          font-size: 20px;
          color: var(--blue);
        }
        .analysis-header p {
          margin: 0;
          font-size: 12px;
          color: var(--muted);
        }
        .analysis-cards {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          margin: 12px 0;
        }
        .analysis-card {
          border: 1px solid var(--line);
          background: #f8fbfe;
          padding: 10px;
        }
        .analysis-card span {
          display: block;
          font-size: 18px;
          font-weight: 700;
          color: var(--text);
        }
        .analysis-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        .analysis-panel {
          border: 1px solid var(--line);
          padding: 10px;
          background: white;
        }
        .analysis-panel h3 {
          margin: 0 0 8px;
          font-size: 14px;
          color: var(--blue);
        }
        .trend-table th,
        .hour-summary-table th {
          background: #eef5fb;
          color: var(--blue);
          text-align: left;
          padding-left: 6px;
        }
        .trend-table td:first-child,
        .hour-summary-table td:first-child,
        .hour-summary-table td:nth-child(2),
        .hour-summary-table td:nth-child(4) {
          text-align: left;
          padding-left: 6px;
        }
        .bar-track {
          width: 100%;
          height: 10px;
          border-radius: 999px;
          background: #e9f0f6;
          overflow: hidden;
        }
        .bar-fill {
          height: 100%;
          border-radius: 999px;
        }
        .state-on { background: var(--on); }
        .state-partial { background: var(--partial); }
        .state-off { background: var(--off); }
        .state-dyskinesia { background: var(--dyskinesia); }
        .state-sleep { background: var(--sleep); }
        @media print {
          html, body {
            width: 297mm;
            height: 210mm;
          }
          .page {
            gap: 0;
            width: auto;
            margin: 0;
          }
          .sheet {
            min-height: calc(210mm - 16mm);
          }
        }
      </style>
    </head>
    <body>
      <main class="page">
        <section class="sheet">
          <header class="header">
            <div class="header-main">
              <h1>Hodnoceni vlastniho stavu hybnosti a rozpis lecby</h1>
              <p>Tabulkova verze reportu inspirovana papirovym denikem.</p>
            </div>
            <div class="header-side">
              <p><strong>Legenda</strong></p>
              <p>Krizek oznacuje prevladajici stav v dane hodine, spanek je oznacen pismenem S.</p>
              <ul>${buildLegend()}</ul>
            </div>
          </header>

          <section class="meta">
            <div class="meta-cell">
              <span class="meta-label">Vybrane obdobi</span>
              <div class="meta-value">
                ${escapeHtml(formatLongDate(dateKeys[0]))} az ${escapeHtml(formatLongDate(selectedDate))}
              </div>
            </div>
            <div class="meta-cell">
              <span class="meta-label">Pocet dni na stranu</span>
              <div class="meta-value">${escapeHtml(String(REPORT_DAYS_PAGE_ONE))}</div>
            </div>
            <div class="meta-cell">
              <span class="meta-label">Jmeno pacienta</span>
              <div class="meta-value">${escapeHtml(patientName || "Neuvedeno")}</div>
            </div>
            <div class="meta-cell">
              <span class="meta-label">Rok narozeni</span>
              <div class="meta-value">${escapeHtml(birthYear || "Neuvedeno")}</div>
            </div>
          </section>

          <section class="content">
            <div class="content-head">
              <div>
                <strong>Prehled</strong>
                <span>Na prvni strance jsou ${REPORT_DAYS_PAGE_ONE} dny, aby zustala zachovana citelna tabulkova struktura papiroveho deniku.</span>
              </div>
              <div>
                <strong>Vygenerovano</strong>
                <span>${escapeHtml(generatedAt)}</span>
              </div>
            </div>

            ${dateKeys.map((dateKey) => buildDayTable(dateKey, entries[dateKey])).join("")}

            <p class="footer">NeuroDiary · tiskovy report pro lekare</p>
          </section>
        </section>

        ${buildAnalysisPage(entries, selectedDate)}
      </main>
    </body>
  </html>`;
}

export function openDoctorReportPrint({ entries, selectedDate, patientName, birthYear }) {
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    throw new Error("Unable to open report window");
  }

  const html = buildDoctorReportHtml({ entries, selectedDate, patientName, birthYear });
  reportWindow.document.open();
  reportWindow.document.write(html);
  reportWindow.document.close();

  const triggerPrint = () => {
    reportWindow.focus();
    reportWindow.print();
  };

  if (reportWindow.document.readyState === "complete") {
    setTimeout(triggerPrint, 150);
    return;
  }

  reportWindow.addEventListener(
    "load",
    () => {
      setTimeout(triggerPrint, 150);
    },
    { once: true },
  );
}
