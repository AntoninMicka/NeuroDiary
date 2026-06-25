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

function buildLegend() {
  return HOUR_STATES.map(
    (state) => `<li><strong>${escapeHtml(state.shortLabel)}</strong> ${escapeHtml(state.label)}</li>`,
  ).join("");
}

function formatShortDate(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  return new Intl.DateTimeFormat("cs-CZ", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
  }).format(date);
}

function shiftDateKey(dateKey, offsetDays) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function buildReportDateKeys(selectedDate, count = 5) {
  return Array.from({ length: count }, (_, index) => shiftDateKey(selectedDate, index - count + 1));
}

function buildHourCells(entry) {
  return TRACKING_HOURS.map((hourLabel) => {
    const definition = getStateDefinition(entry?.hours?.[hourLabel] ?? "sleep");
    return `
      <div class="hour-cell state-${escapeHtml(definition.key)}">
        <span>${escapeHtml(definition.shortLabel)}</span>
      </div>
    `;
  }).join("");
}

function buildMedicationMarkers(entry) {
  if (!entry || entry.medications.length === 0) {
    return `<div class="med-empty">Bez medikace</div>`;
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
        <div class="med-marker" style="left: ${left}%;">
          <span class="med-dot"></span>
          <span class="med-label">${escapeHtml(`${medication.time} ${medication.name} ${medication.dose}`)}</span>
        </div>
      `;
    })
    .join("");
}

function buildDaySections(entries, selectedDate) {
  return buildReportDateKeys(selectedDate)
    .map((dateKey) => {
      const entry = entries[dateKey];
      const counts = summarizeHours(entry?.hours ?? {});
      const dominantStateKey = Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0];
      const dominantState = entry
        ? getStateDefinition(dominantStateKey ?? "on").label
        : "Bez zaznamu";

      return `
        <section class="day-block">
          <div class="day-meta">
            <p class="day-date">${escapeHtml(formatShortDate(dateKey))}</p>
            <p>${escapeHtml(entry ? formatSleepQuality(entry.sleepQuality) : "Bez zaznamu")}</p>
            <p>${escapeHtml(entry ? formatOverallStatus(entry.overallStatus) : "Bez zaznamu")}</p>
            <p>${escapeHtml(dominantState)}</p>
          </div>

          <div class="day-body">
            <div class="timeline-labels">
              <span>Hybnost</span>
              <span>Leky</span>
            </div>

            <div class="timeline-stack">
              <div class="hours-grid">
                ${buildHourCells(entry)}
              </div>
              <div class="med-track">
                <div class="med-track-line"></div>
                ${buildMedicationMarkers(entry)}
              </div>
            </div>
          </div>
        </section>
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
        @page {
          size: A4 portrait;
          margin: 8mm;
        }
        :root {
          --blue: #315979;
          --blue-soft: #d9ebf8;
          --line: #9fb5c8;
          --text: #22313f;
          --muted: #5c7285;
          --on: #d9ebf8;
          --partial: #f8e7b7;
          --off: #f6c9c9;
          --dyskinesia: #ead8ff;
          --sleep: #e7edf2;
          --timeline-offset: 178px;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          color: var(--text);
          font-family: "Segoe UI", "Helvetica Neue", sans-serif;
          background: white;
        }
        .page {
          padding: 0;
        }
        .sheet {
          border: 1.5px solid var(--blue);
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
          grid-template-columns: 1.2fr 0.8fr 0.6fr;
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
        .meta-label {
          display: block;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--blue);
          margin-bottom: 4px;
        }
        .meta-value {
          font-size: 12px;
          font-weight: 600;
          line-height: 1.3;
        }
        .content {
          padding: 10px;
        }
        .content-head {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          align-items: end;
          margin-bottom: 8px;
        }
        .content-head strong,
        .hours-header strong {
          display: block;
          color: var(--blue);
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.04em;
        }
        .content-head span,
        .hours-header span {
          font-size: 12px;
        }
        .hours-header {
          display: grid;
          grid-template-columns: var(--timeline-offset) repeat(20, minmax(0, 1fr));
          gap: 0;
          margin-bottom: 6px;
          align-items: end;
        }
        .hour-header-cell {
          text-align: center;
          font-size: 10px;
          color: var(--muted);
        }
        .day-block {
          display: grid;
          grid-template-columns: 116px 1fr;
          gap: 6px;
          border: 1px solid var(--line);
          margin-bottom: 6px;
          page-break-inside: avoid;
        }
        .day-block:last-of-type {
          margin-bottom: 0;
        }
        .day-meta {
          background: #f5f9fc;
          border-right: 1px solid var(--line);
          padding: 7px 8px;
        }
        .day-meta p {
          margin: 0 0 4px;
          font-size: 10px;
          line-height: 1.2;
        }
        .day-meta p:last-child {
          margin-bottom: 0;
        }
        .day-date {
          font-size: 12px !important;
          font-weight: 700;
          color: var(--blue);
        }
        .day-body {
          padding: 6px 8px 7px 0;
        }
        .timeline-labels {
          display: grid;
          grid-template-rows: 30px 34px;
          align-items: center;
          justify-items: start;
          width: 52px;
          float: left;
          font-size: 10px;
          color: var(--muted);
        }
        .timeline-stack {
          margin-left: 56px;
        }
        .hours-grid {
          display: grid;
          grid-template-columns: repeat(20, minmax(0, 1fr));
          gap: 1px;
          border: 1px solid var(--line);
          background: var(--line);
          height: 30px;
        }
        .hour-cell {
          display: flex;
          align-items: center;
          justify-content: center;
          background: white;
          font-size: 9px;
          font-weight: 700;
        }
        .state-on { background: var(--on); }
        .state-partial { background: var(--partial); }
        .state-off { background: var(--off); }
        .state-dyskinesia { background: var(--dyskinesia); }
        .state-sleep { background: var(--sleep); }
        .med-track {
          position: relative;
          height: 34px;
          margin-top: 4px;
          border: 1px solid var(--line);
          background:
            repeating-linear-gradient(
              to right,
              transparent 0,
              transparent calc(5% - 1px),
              rgba(159, 181, 200, 0.5) calc(5% - 1px),
              rgba(159, 181, 200, 0.5) 5%
            ),
            #fff;
        }
        .med-track-line {
          position: absolute;
          left: 0;
          right: 0;
          top: 16px;
          border-top: 1px dashed var(--line);
        }
        .med-marker {
          position: absolute;
          top: 4px;
          transform: translateX(-50%);
          text-align: center;
          max-width: 72px;
        }
        .med-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: var(--blue);
        }
        .med-label {
          display: block;
          margin-top: 3px;
          font-size: 8px;
          line-height: 1.1;
        }
        .med-empty {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 9px;
          color: var(--muted);
        }
        .footer {
          margin-top: 8px;
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
              <span class="meta-label">Vybrane obdobi</span>
              <div class="meta-value">
                ${escapeHtml(formatLongDate(buildReportDateKeys(selectedDate)[0]))} az
                ${escapeHtml(formatLongDate(selectedDate))}
              </div>
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
                <span>5 po sobe jdoucich dni s hodinovou hybnosti a casy uziti leku.</span>
              </div>
              <div>
                <strong>Vygenerovano</strong>
                <span>${escapeHtml(generatedAt)}</span>
              </div>
            </div>

            <div class="hours-header">
              <div></div>
              ${TRACKING_HOURS.map((hourLabel) => `<div class="hour-header-cell">${escapeHtml(hourLabel)}</div>`).join("")}
            </div>

            ${buildDaySections(entries, selectedDate)}

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
