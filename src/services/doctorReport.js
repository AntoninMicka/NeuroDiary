import {
  formatLongDate,
  formatOverallStatus,
  formatSleepQuality,
  getStateDefinition,
  HOUR_STATES,
  summarizeHours,
  TRACKING_HOURS,
} from "../domain/diary.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildMedicationSummary(entry) {
  if (entry.medications.length === 0) {
    return "Neuvedeno";
  }

  return entry.medications
    .slice()
    .sort((left, right) => left.time.localeCompare(right.time))
    .map((item) => `${item.time} ${item.name} ${item.dose}`)
    .join(", ");
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
      const stateKey = entry.hours[hourLabel];
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
      ${TRACKING_HOURS.map((hourLabel) => `<td>${entry.hours[hourLabel] === "sleep" ? "S" : ""}</td>`).join("")}
    </tr>
  `);

  return rows.join("");
}

function buildTrendRows(entries, selectedDate) {
  return Object.keys(entries)
    .sort((left, right) => right.localeCompare(left))
    .filter((dateKey) => dateKey <= selectedDate)
    .slice(0, 7)
    .map((dateKey) => {
      const entry = entries[dateKey];
      const counts = summarizeHours(entry.hours);
      const dominantStateKey = Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0];

      return `
        <tr>
          <td>${escapeHtml(formatLongDate(dateKey))}</td>
          <td>${escapeHtml(formatSleepQuality(entry.sleepQuality))}</td>
          <td>${escapeHtml(getStateDefinition(dominantStateKey ?? "on").label)}</td>
          <td>${escapeHtml(String(entry.medications.length))}</td>
          <td>${escapeHtml(formatOverallStatus(entry.overallStatus))}</td>
        </tr>
      `;
    })
    .join("");
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

  return `<!DOCTYPE html>
  <html lang="cs">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>NeuroDiary Report</title>
      <style>
        :root {
          --blue: #315979;
          --blue-soft: #d9ebf8;
          --line: #9fb5c8;
          --text: #22313f;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          color: var(--text);
          font-family: "Segoe UI", "Helvetica Neue", sans-serif;
          background: white;
        }
        .page {
          padding: 22px;
        }
        .sheet {
          border: 2px solid var(--blue);
        }
        .header {
          display: grid;
          grid-template-columns: 1.4fr 1fr;
          background: var(--blue);
          color: white;
        }
        .header-main {
          padding: 18px 20px;
        }
        .header-main h1 {
          margin: 0 0 8px;
          font-size: 34px;
          line-height: 1.05;
        }
        .header-main p {
          margin: 0;
          font-size: 16px;
        }
        .header-side {
          padding: 18px 20px;
          border-left: 2px solid rgba(255,255,255,0.25);
        }
        .header-side p {
          margin: 0 0 8px;
        }
        .header-side ul {
          margin: 8px 0 0 18px;
          padding: 0;
        }
        .meta {
          display: grid;
          grid-template-columns: 1.2fr 0.8fr 0.6fr;
          border-top: 2px solid var(--blue);
        }
        .meta-cell {
          min-height: 72px;
          padding: 10px 14px;
          border-right: 1px solid var(--line);
          background: var(--blue-soft);
        }
        .meta-cell:last-child {
          border-right: 0;
        }
        .meta-label {
          display: block;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--blue);
          margin-bottom: 6px;
        }
        .meta-value {
          font-size: 18px;
          font-weight: 600;
        }
        .content {
          padding: 16px;
        }
        .summary {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 14px;
        }
        .summary-card {
          border: 1px solid var(--line);
          padding: 10px 12px;
          background: #f8fbfe;
        }
        .summary-card strong {
          display: block;
          font-size: 12px;
          text-transform: uppercase;
          color: var(--blue);
          margin-bottom: 6px;
        }
        .diary-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          margin-bottom: 16px;
        }
        .diary-table th,
        .diary-table td {
          border: 1px solid var(--line);
          text-align: center;
          padding: 8px 4px;
          min-width: 32px;
          font-size: 13px;
        }
        .diary-table thead th {
          background: var(--blue);
          color: white;
          font-weight: 700;
        }
        .diary-table tbody th {
          text-align: left;
          background: #eef5fb;
          width: 220px;
        }
        .notes, .trend {
          margin-top: 12px;
        }
        .notes-box {
          border: 1px solid var(--line);
          padding: 12px;
          min-height: 84px;
          white-space: pre-wrap;
        }
        .trend table {
          width: 100%;
          border-collapse: collapse;
        }
        .trend th, .trend td {
          border: 1px solid var(--line);
          padding: 8px 10px;
          text-align: left;
        }
        .trend th {
          background: #eef5fb;
          color: var(--blue);
          text-transform: uppercase;
          font-size: 12px;
        }
        .footer {
          margin-top: 12px;
          color: #587086;
          font-size: 12px;
        }
        @media print {
          .page { padding: 0; }
        }
      </style>
    </head>
    <body>
      <main class="page">
        <section class="sheet">
          <header class="header">
            <div class="header-main">
              <h1>Hodnoceni vlastniho stavu hybnosti a rozpis lecby</h1>
              <p>Report vygenerovany z aplikace NeuroDiary pro vybrany denikovy zaznam.</p>
            </div>
            <div class="header-side">
              <p><strong>Legenda</strong></p>
              <p>Oznacte krizkem svuj stav hybnosti. Spanek oznacte pismenem S.</p>
              <ul>${buildLegend()}</ul>
            </div>
          </header>

          <section class="meta">
            <div class="meta-cell">
              <span class="meta-label">Nazev leku</span>
              <div class="meta-value">${escapeHtml(buildMedicationSummary(entry))}</div>
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
            <div class="summary">
              <div class="summary-card">
                <strong>Datum</strong>
                <span>${escapeHtml(formatLongDate(selectedDate))}</span>
              </div>
              <div class="summary-card">
                <strong>Kvalita spanku</strong>
                <span>${escapeHtml(formatSleepQuality(entry.sleepQuality))}</span>
              </div>
              <div class="summary-card">
                <strong>Celkovy den</strong>
                <span>${escapeHtml(formatOverallStatus(entry.overallStatus))}</span>
              </div>
              <div class="summary-card">
                <strong>Vygenerovano</strong>
                <span>${escapeHtml(generatedAt)}</span>
              </div>
            </div>

            <table class="diary-table">
              <thead>
                <tr>
                  <th>Datum / Hod.</th>
                  ${TRACKING_HOURS.map((hourLabel) => `<th>${escapeHtml(hourLabel)}</th>`).join("")}
                </tr>
              </thead>
              <tbody>
                ${buildMatrixRows(entry)}
              </tbody>
            </table>

            <section class="notes">
              <p><strong>Poznamky</strong></p>
              <div class="notes-box">${escapeHtml(entry.notes.trim() || "Bez poznamek.")}</div>
            </section>

            <section class="trend">
              <p><strong>Poslednich 7 dni</strong></p>
              <table>
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Spanek</th>
                    <th>Prevladajici stav</th>
                    <th>Pocet davek</th>
                    <th>Celkovy den</th>
                  </tr>
                </thead>
                <tbody>${buildTrendRows(entries, selectedDate)}</tbody>
              </table>
            </section>

            <p class="footer">NeuroDiary · tiskovy report pro lekare</p>
          </section>
        </section>
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
