import {
  formatLongDate,
  formatOverallStatus,
  formatSleepQuality,
  getStateDefinition,
  HOUR_STATES,
  summarizeHours,
  TRACKING_HOURS,
} from "../domain/diary.js";

const REPORT_DAYS_PAGE_ONE = 4;
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

function formatNumericDate(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function buildMatrixRows(entry) {
  const movementStates = HOUR_STATES.filter((state) => state.key !== "sleep");

  const rows = movementStates.map((state) => {
    const cells = TRACKING_HOURS.map((hourLabel) => {
      const stateKey = entry?.hours?.[hourLabel];
      const marker = stateKey === state.key ? "X" : "";
      const cellClass = marker ? `filled state-${escapeHtml(state.key)}` : "";
      return `<td class="${cellClass}">${marker}</td>`;
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
      ${TRACKING_HOURS.map((hourLabel) => {
        const isSleep = entry?.hours?.[hourLabel] === "sleep";
        return `<td class="${isSleep ? "filled state-sleep" : ""}">${isSleep ? "S" : ""}</td>`;
      }).join("")}
    </tr>
  `);

  return rows.join("");
}

function buildMedicationTimelineRow(entry) {
  if (!entry?.medications?.length) {
    return `<div class="medication-empty">Bez medikace</div>`;
  }

  const startHour = Number(TRACKING_HOURS[0]);
  const endHour = Number(TRACKING_HOURS.at(-1)) + 1;
  const totalHours = endHour - startHour;

  return entry.medications
    .slice()
    .sort((left, right) => left.time.localeCompare(right.time))
    .map((medication) => {
      const [hoursRaw, minutesRaw] = medication.time.split(":");
      const hours = Number(hoursRaw);
      const minutes = Number(minutesRaw);
      const offsetHours = Math.min(Math.max(hours + minutes / 60 - startHour, 0), totalHours);
      const left = (offsetHours / totalHours) * 100;

      return `
        <div class="medication-marker" style="left: ${left}%;">
          <span class="medication-dot"></span>
          <span class="medication-caption">
            <strong>${escapeHtml(medication.name)}</strong>
            <span>${escapeHtml(`${medication.time} ${medication.dose}`)}</span>
          </span>
        </div>
      `;
    })
    .join("");
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
        <colgroup>
          <col class="label-column" />
          ${TRACKING_HOURS.map(() => '<col class="hour-column" />').join("")}
        </colgroup>
        <thead>
          <tr>
            <th>Stav / Hod.</th>
            ${TRACKING_HOURS.map((hourLabel) => `<th>${escapeHtml(hourLabel)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${buildMatrixRows(entry)}
        </tbody>
      </table>

      <div class="medication-timeline">
        <div class="medication-label">Lecba</div>
        <div class="medication-track">
          <div class="medication-grid"></div>
          <div class="medication-axis"></div>
          ${buildMedicationTimelineRow(entry)}
        </div>
      </div>

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
          grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.9fr);
          align-items: stretch;
          background: white;
          color: var(--text);
          border-bottom: 1.5px solid var(--blue);
        }
        .header-main {
          padding: 6px 8px;
          border-right: 1px solid var(--line);
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .header-main h1 {
          margin: 0;
          font-size: 12px;
          line-height: 1.05;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: var(--blue);
        }
        .header-main p {
          display: none;
        }
        .header-side {
          padding: 0;
          display: grid;
          grid-template-columns: 1.45fr 0.95fr 0.9fr 0.7fr;
        }
        .meta-cell {
          min-height: 40px;
          padding: 4px 8px;
          border-right: 1px solid var(--line);
          background: white;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .meta-cell:last-child {
          border-right: 0;
        }
        .meta-label,
        .section-label {
          display: block;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--blue);
          letter-spacing: 0.04em;
          margin: 0 0 2px;
        }
        .meta-value {
          font-size: 10px;
          font-weight: 600;
          line-height: 1.2;
        }
        .meta-value.compact {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .content,
        .analysis-page {
          padding: 8px;
        }
        .analysis-card strong {
          display: block;
          color: var(--blue);
          text-transform: uppercase;
          font-size: 9px;
          letter-spacing: 0.04em;
          margin-bottom: 2px;
        }
        .day-sheet {
          margin-bottom: 3px;
          page-break-inside: avoid;
        }
        .day-sheet:last-of-type {
          margin-bottom: 0;
        }
        .day-heading {
          display: flex;
          justify-content: space-between;
          align-items: end;
          margin-bottom: 2px;
        }
        .day-title {
          margin: 0;
          font-size: 10px;
          font-weight: 700;
          color: var(--blue);
        }
        .day-subtitle {
          margin: 1px 0 0;
          font-size: 8px;
          color: var(--muted);
        }
        .diary-table,
        .trend-table,
        .hour-summary-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .label-column {
          width: 156px;
        }
        .hour-column {
          width: calc((100% - 156px) / 20);
        }
        .diary-table th,
        .diary-table td,
        .trend-table th,
        .trend-table td,
        .hour-summary-table th,
        .hour-summary-table td {
          border: 1px solid var(--line);
          padding: 2px 1px;
          font-size: 8px;
          text-align: center;
          vertical-align: middle;
        }
        .diary-table thead th {
          background: var(--blue);
          color: white;
          font-weight: 700;
          font-size: 8px;
        }
        .diary-table tbody th {
          text-align: left;
          padding-left: 4px;
          background: #eef5fb;
          font-weight: 600;
          font-size: 8px;
        }
        .diary-table tbody td {
          height: 13px;
        }
        .diary-table td.filled {
          font-weight: 700;
          color: #18324a;
        }
        .medication-timeline {
          display: grid;
          grid-template-columns: 156px 1fr;
          gap: 0;
          margin-top: 1px;
        }
        .medication-label {
          border: 1px solid var(--line);
          border-right: 0;
          background: #edf7f1;
          font-size: 9px;
          font-weight: 600;
          display: flex;
          align-items: center;
          padding: 0 0 0 4px;
          min-height: 24px;
        }
        .medication-track {
          position: relative;
          min-height: 24px;
          border: 1px solid var(--line);
          background: #fff;
          overflow: hidden;
        }
        .medication-grid {
          position: absolute;
          inset: 0;
          background:
            repeating-linear-gradient(
              to right,
              transparent 0,
              transparent calc(5% - 1px),
              var(--line-soft) calc(5% - 1px),
              var(--line-soft) 5%
            );
        }
        .medication-axis {
          position: absolute;
          left: 0;
          right: 0;
          top: 10px;
          border-top: 1px dashed var(--line);
        }
        .medication-marker {
          position: absolute;
          top: 1px;
          transform: translateX(-50%);
          width: 54px;
          text-align: center;
        }
        .medication-dot {
          display: inline-block;
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: var(--blue);
        }
        .medication-caption {
          display: block;
          margin-top: 0;
          font-size: 6px;
          line-height: 1.05;
          color: var(--blue);
        }
        .medication-caption strong,
        .medication-caption span {
          display: block;
        }
        .medication-caption strong {
          font-weight: 700;
        }
        .medication-empty {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 8px;
          color: var(--muted);
        }
        .day-note {
          margin-top: 1px;
          border: 1px solid var(--line-soft);
          background: #fafcfe;
          padding: 2px 4px;
          font-size: 8px;
          line-height: 1.1;
        }
        .footer {
          display: none;
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
        .state-on { background: #d9ebf8; }
        .state-partial { background: #f8e7b7; }
        .state-off { background: #f6c9c9; }
        .state-dyskinesia { background: #ead8ff; }
        .state-sleep { background: #e7edf2; }
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
            </div>
            <section class="header-side">
              <div class="meta-cell">
                <span class="meta-label">Obdobi</span>
                <div class="meta-value compact">
                  ${escapeHtml(formatNumericDate(dateKeys[0]))} - ${escapeHtml(formatNumericDate(selectedDate))}
                </div>
              </div>
              <div class="meta-cell">
                <span class="meta-label">Vygenerovano</span>
                <div class="meta-value">${escapeHtml(generatedAt)}</div>
              </div>
              <div class="meta-cell">
                <span class="meta-label">Jmeno</span>
                <div class="meta-value">${escapeHtml(patientName || "Neuvedeno")}</div>
              </div>
              <div class="meta-cell">
                <span class="meta-label">Rok narozeni</span>
                <div class="meta-value">${escapeHtml(birthYear || "Neuvedeno")}</div>
              </div>
            </section>
          </header>

          <section class="content">
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
