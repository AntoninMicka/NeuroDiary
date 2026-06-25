import { formatLongDate, summarizeHours } from "../domain/diary.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stateBadge(stateKey) {
  const colors = {
    on: "#2c8c5a",
    slow: "#c97b34",
    off: "#b84a4a",
    sleep: "#0c5a68",
  };

  return `<span class="badge" style="color:${colors[stateKey] ?? "#1f2933"}">${escapeHtml(
    String(stateKey).toUpperCase(),
  )}</span>`;
}

function buildMedicationRows(entry) {
  if (entry.medications.length === 0) {
    return `<tr><td colspan="3">No medication logged for this day.</td></tr>`;
  }

  return entry.medications
    .slice()
    .sort((left, right) => left.time.localeCompare(right.time))
    .map(
      (medication) => `
        <tr>
          <td>${escapeHtml(medication.time)}</td>
          <td>${escapeHtml(medication.name)}</td>
          <td>${escapeHtml(medication.dose)}</td>
        </tr>
      `,
    )
    .join("");
}

function buildHourRows(entry) {
  return Object.entries(entry.hours)
    .map(
      ([hourLabel, stateKey]) => `
        <tr>
          <td>${escapeHtml(hourLabel)}</td>
          <td>${stateBadge(stateKey)}</td>
        </tr>
      `,
    )
    .join("");
}

function buildTrendRows(entries, selectedDate) {
  const dates = Object.keys(entries)
    .sort((left, right) => right.localeCompare(left))
    .filter((dateKey) => dateKey <= selectedDate)
    .slice(0, 7);

  return dates
    .map((dateKey) => {
      const entry = entries[dateKey];
      const counts = summarizeHours(entry.hours);
      const dominantState = Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0];

      return `
        <tr>
          <td>${escapeHtml(formatLongDate(dateKey))}</td>
          <td>${escapeHtml(entry.sleepQuality)}</td>
          <td>${escapeHtml(entry.overallStatus)}</td>
          <td>${escapeHtml(dominantState ? dominantState.toUpperCase() : "N/A")}</td>
          <td>${escapeHtml(String(entry.medications.length))}</td>
        </tr>
      `;
    })
    .join("");
}

export function buildDoctorReportHtml({ entries, selectedDate }) {
  const entry = entries[selectedDate];
  const counts = summarizeHours(entry.hours);
  const generatedAt = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>NeuroDiary Doctor Report</title>
      <style>
        :root {
          color-scheme: light;
          --text: #1f2933;
          --muted: #5f6c7b;
          --line: #d7dee5;
          --surface: #f8f5ef;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: "Segoe UI", "Helvetica Neue", sans-serif;
          color: var(--text);
          background: white;
        }
        .page {
          width: min(960px, 100%);
          margin: 0 auto;
          padding: 32px 24px 56px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          border-bottom: 2px solid var(--line);
          padding-bottom: 18px;
          margin-bottom: 24px;
        }
        .header h1, h2, h3, p { margin: 0; }
        .kicker {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--muted);
          margin-bottom: 8px;
        }
        .lede {
          color: var(--muted);
          margin-top: 8px;
          max-width: 42rem;
        }
        .meta {
          text-align: right;
          color: var(--muted);
          font-size: 14px;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
          margin-bottom: 22px;
        }
        .card {
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 16px;
          background: var(--surface);
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .stat {
          padding: 10px 12px;
          border-radius: 12px;
          background: white;
          border: 1px solid var(--line);
        }
        .stat strong {
          display: block;
          margin-bottom: 4px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 12px;
          font-size: 14px;
        }
        th, td {
          text-align: left;
          border-bottom: 1px solid var(--line);
          padding: 10px 8px;
          vertical-align: top;
        }
        th {
          color: var(--muted);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .note {
          white-space: pre-wrap;
          line-height: 1.55;
        }
        .badge {
          font-weight: 700;
          letter-spacing: 0.04em;
        }
        .wide {
          margin-top: 18px;
        }
        @media print {
          .page { padding: 18px; }
        }
      </style>
    </head>
    <body>
      <main class="page">
        <section class="header">
          <div>
            <p class="kicker">Doctor report</p>
            <h1>NeuroDiary daily report</h1>
            <p class="lede">
              Structured overview for neurological follow-up based on the selected diary day.
            </p>
          </div>
          <div class="meta">
            <p><strong>Selected day:</strong> ${escapeHtml(formatLongDate(selectedDate))}</p>
            <p><strong>Generated:</strong> ${escapeHtml(generatedAt)}</p>
          </div>
        </section>

        <section class="grid">
          <article class="card">
            <p class="kicker">Daily summary</p>
            <div class="stats">
              <div class="stat">
                <strong>Sleep quality</strong>
                <span>${escapeHtml(entry.sleepQuality)}</span>
              </div>
              <div class="stat">
                <strong>Overall day</strong>
                <span>${escapeHtml(entry.overallStatus)}</span>
              </div>
              <div class="stat">
                <strong>Medication doses</strong>
                <span>${escapeHtml(String(entry.medications.length))}</span>
              </div>
              <div class="stat">
                <strong>Dominant state</strong>
                <span>${escapeHtml(
                  Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0]?.toUpperCase() ??
                    "N/A",
                )}</span>
              </div>
            </div>
          </article>

          <article class="card">
            <p class="kicker">State distribution</p>
            <div class="stats">
              ${Object.entries(counts)
                .map(
                  ([stateKey, count]) => `
                    <div class="stat">
                      <strong>${escapeHtml(stateKey.toUpperCase())}</strong>
                      <span>${escapeHtml(String(count))} hours</span>
                    </div>
                  `,
                )
                .join("")}
            </div>
          </article>
        </section>

        <section class="card">
          <p class="kicker">Clinical notes</p>
          <div class="note">${escapeHtml(entry.notes.trim() || "No notes recorded.")}</div>
        </section>

        <section class="grid wide">
          <article class="card">
            <p class="kicker">Medication plan</p>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Medication</th>
                  <th>Dose</th>
                </tr>
              </thead>
              <tbody>${buildMedicationRows(entry)}</tbody>
            </table>
          </article>

          <article class="card">
            <p class="kicker">Hourly state log</p>
            <table>
              <thead>
                <tr>
                  <th>Hour</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>${buildHourRows(entry)}</tbody>
            </table>
          </article>
        </section>

        <section class="card wide">
          <p class="kicker">Recent trend</p>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Sleep</th>
                <th>Overall day</th>
                <th>Dominant state</th>
                <th>Doses</th>
              </tr>
            </thead>
            <tbody>${buildTrendRows(entries, selectedDate)}</tbody>
          </table>
        </section>
      </main>
    </body>
  </html>`;
}

export function openDoctorReportPrint({ entries, selectedDate }) {
  const reportWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!reportWindow) {
    throw new Error("Unable to open report window");
  }

  reportWindow.document.open();
  reportWindow.document.write(buildDoctorReportHtml({ entries, selectedDate }));
  reportWindow.document.close();
  reportWindow.focus();
  reportWindow.print();
}
