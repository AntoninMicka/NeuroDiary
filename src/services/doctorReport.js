import {
  formatLongDate,
  formatOverallStatus,
  formatSleepQuality,
  getTodayKey,
  getStateDefinition,
  HOUR_STATES,
  summarizeHours,
  TRACKING_HOURS,
} from "../domain/diary.js";
import { evaluateDayQuality } from "./dataQuality.js";

const REPORT_DAYS_PAGE_ONE = 4;
const ANALYSIS_DAYS = 7;
const ANALYSIS_LONG_DAYS = 30;
const ANALYSIS_WEEK_BLOCKS = 25;
const CHARTS_PER_PAGE = 5;
const STATE_CHART_COLORS = {
  dyskinesia: "#8d55b5",
  on: "#2c8c5a",
  partial: "#c97b34",
  off: "#b84a4a",
  sleep: "#7d8e9e",
};
const MEDICATION_COLORS = [
  "#245f8f",
  "#9a4f24",
  "#4f7a38",
  "#76509a",
  "#a23f5d",
  "#18766f",
  "#8a6421",
  "#4f638f",
];
const MEDICATION_LABEL_COLLISION_MINUTES = 90;

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

function buildFirstPageDateKeys(entries, selectedDate, count, skipEmptyDays) {
  if (!skipEmptyDays) {
    return buildDateKeys(selectedDate, count);
  }

  return Object.keys(entries)
    .filter((dateKey) => dateKey <= selectedDate && evaluateDayQuality(entries[dateKey], dateKey).hasAnyData)
    .sort()
    .slice(-count);
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
      <th>Spánek</th>
      ${TRACKING_HOURS.map((hourLabel) => {
        const isSleep = entry?.hours?.[hourLabel] === "sleep";
        return `<td class="${isSleep ? "filled state-sleep" : ""}">${isSleep ? "S" : ""}</td>`;
      }).join("")}
    </tr>
  `);

  return rows.join("");
}

function normalizeMedicationName(value) {
  return String(value ?? "").trim().toLocaleLowerCase("cs-CZ");
}

function buildMedicationColorMap(entries) {
  const names = [...new Set(
    Object.values(entries)
      .flatMap((entry) => entry?.medications ?? [])
      .map((medication) => normalizeMedicationName(medication.name))
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right, "cs-CZ"));

  return new Map(names.map((name, index) => [name, MEDICATION_COLORS[index % MEDICATION_COLORS.length]]));
}

function getMedicationMinuteOfDay(medication) {
  const [hoursRaw, minutesRaw] = medication.time.split(":");
  return Number(hoursRaw) * 60 + Number(minutesRaw);
}

function assignMedicationLanes(medications) {
  const laneLastMinutes = [-Infinity, -Infinity];
  return medications.map((medication) => {
    const minuteOfDay = getMedicationMinuteOfDay(medication);
    const availableLane = laneLastMinutes.findIndex(
      (lastMinute) => minuteOfDay - lastMinute >= MEDICATION_LABEL_COLLISION_MINUTES,
    );
    const lane = availableLane >= 0
      ? availableLane
      : (laneLastMinutes[0] <= laneLastMinutes[1] ? 0 : 1);
    laneLastMinutes[lane] = minuteOfDay;
    return { medication, lane, minuteOfDay };
  });
}

function buildMedicationTimelineRow(entry, medicationColorMap) {
  if (!entry?.medications?.length) {
    return `<div class="medication-empty">Bez medikace</div>`;
  }

  const startHour = Number(TRACKING_HOURS[0]);
  const endHour = Number(TRACKING_HOURS.at(-1)) + 1;
  const totalHours = endHour - startHour;

  const medications = entry.medications
    .slice()
    .sort((left, right) => left.time.localeCompare(right.time));

  return assignMedicationLanes(medications)
    .map(({ medication, lane, minuteOfDay }) => {
      const offsetHours = Math.min(Math.max(minuteOfDay / 60 - startHour, 0), totalHours);
      const left = (offsetHours / totalHours) * 100;
      const medicationColor = medicationColorMap.get(normalizeMedicationName(medication.name)) ?? MEDICATION_COLORS[0];

      return `
        <div class="medication-marker medication-lane-${lane}" style="left: ${left}%; --medication-color: ${medicationColor};">
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

function buildDayTable(dateKey, entry, medicationColorMap) {
  const note = entry?.notes?.trim() || "Bez poznámek.";
  const quality = evaluateDayQuality(entry, dateKey);

  return `
    <section class="day-sheet">
      <div class="day-heading">
        <p class="day-title">
          <span>${escapeHtml(formatLongDate(dateKey))}</span>
          <span class="day-subtitle">
            Spánek: ${escapeHtml(entry ? formatSleepQuality(entry.sleepQuality) : "Bez záznamu")}
            · Den: ${escapeHtml(entry ? formatOverallStatus(entry.overallStatus) : "Bez záznamu")}
            · Kvalita dat: ${escapeHtml(quality.label)} (${quality.hourCoveragePercent} % hodin)
          </span>
        </p>
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
        <div class="medication-label">Léčba</div>
        <div class="medication-track">
          <div class="medication-grid"></div>
          <div class="medication-axis"></div>
          ${buildMedicationTimelineRow(entry, medicationColorMap)}
        </div>
      </div>

      <div class="day-note">
        <strong>Poznámka:</strong> ${escapeHtml(note)}
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
  const items = collectEntries(entries, selectedDate, count)
    .map((item) => ({ ...item, quality: evaluateDayQuality(item.entry, item.dateKey) }))
    .filter(({ quality }) => quality.hasAnyData);
  const stateTotals = HOUR_STATES.reduce((accumulator, state) => {
    accumulator[state.key] = 0;
    return accumulator;
  }, {});

  let totalMedicationDoses = 0;
  let daysWithData = 0;
  let reliableDays = 0;

  for (const { entry, quality } of items) {
    const counts = summarizeHours(entry.hours);
    daysWithData += 1;
    if (quality.isReliable) {
      reliableDays += 1;
    }
    totalMedicationDoses += entry.medications.length;

    for (const state of HOUR_STATES) {
      stateTotals[state.key] += counts[state.key] ?? 0;
    }
  }

  const dominantState = Object.entries(stateTotals).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "on";

  return {
    daysWithData,
    reliableDays,
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

function summarizeHourWindow(entries, selectedDate, hourLabel, count) {
  const counts = HOUR_STATES.reduce((accumulator, state) => {
    accumulator[state.key] = 0;
    return accumulator;
  }, {});

  for (const { entry } of collectEntries(entries, selectedDate, count)) {
    const stateKey = entry?.hours?.[hourLabel];
    if (stateKey && counts[stateKey] !== undefined) {
      counts[stateKey] += 1;
    }
  }

  return counts;
}

function summarizeHourWindowInterval(entries, selectedDate, hourLabel, offsetDays, count) {
  const intervalEndDate = shiftDateKey(selectedDate, -offsetDays);
  return summarizeHourWindow(entries, intervalEndDate, hourLabel, count);
}

function getTreatmentPlanChangeDates(treatmentPlan = []) {
  const changes = new Map();
  const addChange = (dateKey, label) => {
    if (!dateKey) {
      return;
    }
    const labels = changes.get(dateKey) ?? [];
    labels.push(label);
    changes.set(dateKey, labels);
  };

  for (const item of treatmentPlan) {
    const medication = `${item.name} ${item.dose}`.trim();
    if (item.validFrom) {
      addChange(item.validFrom, `Od ${formatNumericDate(item.validFrom)}: ${medication}`);
    }
    if (item.validTo) {
      const nextDate = shiftDateKey(item.validTo, 1);
      addChange(nextDate, `Od ${formatNumericDate(nextDate)} ukonceno: ${medication}`);
    }
  }
  return changes;
}

function buildWeekIntervals(selectedDate, treatmentPlan = []) {
  const changes = getTreatmentPlanChangeDates(treatmentPlan);
  return Array.from({ length: ANALYSIS_WEEK_BLOCKS }, (_, index) => {
    const offsetDays = (ANALYSIS_WEEK_BLOCKS - index - 1) * ANALYSIS_DAYS;
    const endDate = shiftDateKey(selectedDate, -offsetDays);
    const startDate = shiftDateKey(endDate, -(ANALYSIS_DAYS - 1));
    const planChanges = [...changes.entries()]
      .filter(([dateKey]) => dateKey >= startDate && dateKey <= endDate)
      .flatMap(([, labels]) => labels);
    return {
      index,
      label: `W${index + 1}`,
      startDate,
      endDate,
      offsetDays,
      planChanges,
    };
  });
}

function buildHistogramCells(counts, totalDays) {
  const maxValue = HOUR_STATES.reduce((currentMax, state) => {
    const value = counts[state.key] ?? 0;
    return Math.max(currentMax, value);
  }, 0);

  return HOUR_STATES.map((state) => {
    const value = counts[state.key] ?? 0;
    const height = value > 0 && maxValue > 0 ? (value / maxValue) * 100 : 0;
    const emphasisClass =
      value > 0 && maxValue > 0
        ? value === maxValue
          ? "is-peak"
          : "is-secondary"
        : "";

    return `
      <td class="histogram-cell" title="${escapeHtml(`${state.shortLabel}: ${value} / ${totalDays}`)}">
        <div class="histogram-cell-inner">
          <div class="mini-cylinder-fill state-${escapeHtml(state.key)} ${emphasisClass}" style="height: ${height}%;"></div>
        </div>
      </td>
    `;
  }).join("");
}

function buildCompactHistogramCell(counts, totalDays, title, hasPlanChange = false) {
  const maxValue = HOUR_STATES.reduce((currentMax, state) => {
    const value = counts[state.key] ?? 0;
    return Math.max(currentMax, value);
  }, 0);

  const bars = HOUR_STATES.map((state) => {
    const value = counts[state.key] ?? 0;
    const height = value > 0 && maxValue > 0 ? (value / maxValue) * 100 : 0;
    const emphasisClass =
      value > 0 && maxValue > 0
        ? value === maxValue
          ? "is-peak"
          : "is-secondary"
        : "";

    return `
      <div class="compact-week-bar-shell">
        <div class="compact-week-bar state-${escapeHtml(state.key)} ${emphasisClass}" style="height: ${height}%;"></div>
      </div>
    `;
  }).join("");

  return `
    <td class="compact-week-cell ${hasPlanChange ? "has-plan-change" : ""}" title="${escapeHtml(title)}">
      <div class="compact-week-inner">
        ${bars}
      </div>
    </td>
  `;
}

function buildTrendRows(entries, selectedDate) {
  return collectEntries(entries, selectedDate, ANALYSIS_DAYS)
    .reverse()
    .map(({ dateKey, entry }) => {
      const quality = evaluateDayQuality(entry, dateKey);
      if (!quality.hasAnyData) {
        return `
          <tr>
            <td>${escapeHtml(formatLongDate(dateKey))}</td>
            <td colspan="3">Bez záznamu</td>
          </tr>
        `;
      }

      const counts = summarizeHours(entry.hours);
      const dominantStateKey = Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "on";

      return `
        <tr>
          <td>${escapeHtml(formatLongDate(dateKey))}</td>
          <td>${escapeHtml(formatSleepQuality(entry.sleepQuality))}</td>
          <td>${escapeHtml(`${formatOverallStatus(entry.overallStatus)} · ${quality.label}`)}</td>
          <td>${escapeHtml(getStateDefinition(dominantStateKey).label)}</td>
        </tr>
      `;
    })
    .join("");
}

function buildHourSummaryRows(entries, selectedDate, weekIntervals) {
  return TRACKING_HOURS.map((hourLabel) => {
    const weeklyCounts = summarizeHourWindow(entries, selectedDate, hourLabel, ANALYSIS_DAYS);
    const monthlyCounts = summarizeHourWindow(entries, selectedDate, hourLabel, ANALYSIS_LONG_DAYS);
    const monthByWeeks = weekIntervals.map((week) => {
      const counts = summarizeHourWindowInterval(entries, selectedDate, hourLabel, week.offsetDays, ANALYSIS_DAYS);

      return buildCompactHistogramCell(
        counts,
        ANALYSIS_DAYS,
        [
          `${hourLabel}:00 · ${formatNumericDate(week.startDate)} - ${formatNumericDate(week.endDate)}`,
          ...week.planChanges,
        ].join(" · "),
        week.planChanges.length > 0,
      );
    }).join("");

    return `
      <tr>
        <td>${escapeHtml(hourLabel)}:00</td>
        ${buildHistogramCells(weeklyCounts, ANALYSIS_DAYS)}
        <td class="histogram-spacer-cell"></td>
        ${buildHistogramCells(monthlyCounts, ANALYSIS_LONG_DAYS)}
        <td class="histogram-spacer-cell"></td>
        ${monthByWeeks}
      </tr>
    `;
  }).join("");
}

function buildWeekBlockHeaders(weekIntervals) {
  return weekIntervals.map((week) => `
    <th
      class="${week.planChanges.length ? "has-plan-change" : ""}"
      title="${escapeHtml([
        `${formatNumericDate(week.startDate)} - ${formatNumericDate(week.endDate)}`,
        ...week.planChanges,
      ].join(" · "))}"
    >${week.label}${week.planChanges.length ? '<span class="plan-change-symbol">◆</span>' : ""}</th>
  `).join("");
}

function buildHourWeeklyChart(entries, selectedDate, hourLabel, weekIntervals) {
  const plot = { left: 48, right: 985, top: 12, bottom: 122 };
  const width = plot.right - plot.left;
  const height = plot.bottom - plot.top;
  const xForIndex = (index) =>
    plot.left + (weekIntervals.length === 1 ? width / 2 : (index / (weekIntervals.length - 1)) * width);
  const yForValue = (value) => plot.bottom - (value / ANALYSIS_DAYS) * height;
  const weeklyCounts = weekIntervals.map((week) =>
    summarizeHourWindowInterval(entries, selectedDate, hourLabel, week.offsetDays, ANALYSIS_DAYS),
  );

  const horizontalGrid = [0, 2, 4, 6, 7].map((value) => {
    const y = yForValue(value);
    return `
      <line x1="${plot.left}" y1="${y}" x2="${plot.right}" y2="${y}" class="chart-grid-line" />
      <text x="${plot.left - 8}" y="${y + 3}" class="chart-axis-label" text-anchor="end">${value}</text>
    `;
  }).join("");
  const xLabels = weekIntervals.map((week, index) => {
    if (index % 4 !== 0 && index !== weekIntervals.length - 1) {
      return "";
    }
    return `<text x="${xForIndex(index)}" y="140" class="chart-axis-label" text-anchor="middle">${week.label}</text>`;
  }).join("");
  const planChangeLines = weekIntervals
    .map((week, index) => week.planChanges.length ? `
      <line x1="${xForIndex(index)}" y1="${plot.top}" x2="${xForIndex(index)}" y2="${plot.bottom}" class="chart-plan-change" />
    ` : "")
    .join("");
  const stateLines = HOUR_STATES.map((state) => {
    const points = weeklyCounts
      .map((counts, index) => `${xForIndex(index)},${yForValue(counts[state.key] ?? 0)}`)
      .join(" ");
    return `<polyline points="${points}" fill="none" stroke="${STATE_CHART_COLORS[state.key]}" class="chart-state-line" />`;
  }).join("");

  return `
    <article class="weekly-hour-chart">
      <h3>${escapeHtml(hourLabel)}:00</h3>
      <svg viewBox="0 0 1000 146" role="img" aria-label="Týdenní počty stavů pro hodinu ${escapeHtml(hourLabel)}">
        ${horizontalGrid}
        ${planChangeLines}
        ${stateLines}
        ${xLabels}
      </svg>
    </article>
  `;
}

function buildChartLegend() {
  return `
    <div class="chart-legend">
      ${HOUR_STATES.map((state) => `
        <span><i style="background:${STATE_CHART_COLORS[state.key]}"></i>${escapeHtml(state.shortLabel)}</span>
      `).join("")}
    </div>
  `;
}

function buildWeeklyChartsPages(entries, selectedDate, weekIntervals) {
  const charts = TRACKING_HOURS.map((hourLabel) =>
    buildHourWeeklyChart(entries, selectedDate, hourLabel, weekIntervals),
  );
  const pages = [];
  for (let index = 0; index < charts.length; index += CHARTS_PER_PAGE) {
    pages.push(`
      <section class="sheet charts-page">
        <header class="charts-header">
          <div>
            <p class="section-label">Týdenní grafy · ${index + 1}-${Math.min(index + CHARTS_PER_PAGE, charts.length)} / ${charts.length}</p>
            <h2>Výskyt stavů po hodinách za ${ANALYSIS_WEEK_BLOCKS} týdnů</h2>
          </div>
          ${buildChartLegend()}
        </header>
        <div class="weekly-charts">${charts.slice(index, index + CHARTS_PER_PAGE).join("")}</div>
      </section>
    `);
  }
  return pages.join("");
}

function buildAnalysisPage(entries, selectedDate) {
  const summary = summarizeWindow(entries, selectedDate, ANALYSIS_DAYS);
  const weekIntervals = buildWeekIntervals(selectedDate);

  return `
    <section class="sheet analysis-page">
      <header class="analysis-header">
        <div>
          <p class="section-label">Popisný souhrn</p>
          <h2>Souhrn dnů a stavů za posledních ${ANALYSIS_DAYS} dní</h2>
          <p>Pouze přehled zaznamenaných údajů bez klinické interpretace.</p>
        </div>
      </header>

      <section class="analysis-cards">
        <article class="analysis-card">
          <strong>Dny se záznamem</strong>
          <span>${escapeHtml(String(summary.daysWithData))} / ${ANALYSIS_DAYS}</span>
        </article>
        <article class="analysis-card">
          <strong>Spolehlivé dny</strong>
          <span>${escapeHtml(String(summary.reliableDays))} / ${ANALYSIS_DAYS}</span>
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
          <h3>Denní trend</h3>
          <table class="trend-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Spánek</th>
                <th>Den</th>
                <th>Prevladajici stav</th>
              </tr>
            </thead>
            <tbody>${buildTrendRows(entries, selectedDate)}</tbody>
          </table>
        </article>

        <article class="analysis-panel">
          <h3>Hodinový souhrn</h3>
          <table class="hour-summary-table">
            <thead>
              <tr>
                <th rowspan="2">Čas</th>
                <th colspan="5">7 dní</th>
                <th rowspan="2" class="histogram-spacer-head"></th>
                <th colspan="5">30 dní</th>
                <th rowspan="2" class="histogram-spacer-head"></th>
                <th colspan="${ANALYSIS_WEEK_BLOCKS}">${ANALYSIS_WEEK_BLOCKS}× 7 dní</th>
              </tr>
              <tr>
                ${HOUR_STATES.map((state) => `<th>${escapeHtml(state.shortLabel)}</th>`).join("")}
                ${HOUR_STATES.map((state) => `<th>${escapeHtml(state.shortLabel)}</th>`).join("")}
                ${buildWeekBlockHeaders(weekIntervals)}
              </tr>
            </thead>
            <tbody>${buildHourSummaryRows(entries, selectedDate, weekIntervals)}</tbody>
          </table>
        </article>
      </section>
    </section>
    ${buildWeeklyChartsPages(entries, selectedDate, weekIntervals)}
  `;
}

export function buildDoctorReportHtml({
  entries,
  treatmentPlan = [],
  selectedDate,
  patientName = "",
  birthYear = "",
  includeToday = true,
  skipEmptyDays = true,
  todayDate = getTodayKey(),
}) {
  const reportEndDate = !includeToday && selectedDate === todayDate
    ? shiftDateKey(selectedDate, -1)
    : selectedDate;

  const generatedAt = new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  const dateKeys = buildFirstPageDateKeys(entries, reportEndDate, REPORT_DAYS_PAGE_ONE, skipEmptyDays);
  if (!dateKeys.length) {
    throw new Error(`Do data ${reportEndDate} nebyl nalezen žádný vyplněný den.`);
  }
  const medicationColorMap = buildMedicationColorMap(entries);

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
          --on-border: #2c6f99;
          --partial-border: #a96325;
          --off-border: #9e3f3f;
          --dyskinesia-border: #744797;
          --sleep-border: #657786;
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
        .analysis-page {
          width: 100%;
          padding: 6px;
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
          align-items: baseline;
          margin-bottom: 2px;
        }
        .day-title {
          margin: 0;
          font-size: 10px;
          font-weight: 700;
          color: var(--blue);
          white-space: nowrap;
        }
        .day-subtitle {
          margin-left: 5px;
          font-size: 8px;
          font-weight: 400;
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
          min-height: 26px;
        }
        .medication-track {
          position: relative;
          min-height: 26px;
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
          top: 12px;
          border-top: 1px dashed var(--line);
        }
        .medication-marker {
          position: absolute;
          top: 2px;
          transform: translateX(-3.5px);
          width: 82px;
          display: flex;
          align-items: flex-start;
          gap: 2px;
          text-align: left;
          color: var(--medication-color);
        }
        .medication-marker.medication-lane-1 {
          top: 14px;
        }
        .medication-dot {
          display: inline-block;
          flex: 0 0 7px;
          width: 7px;
          height: 7px;
          margin-top: 1px;
          border-radius: 999px;
          background: var(--medication-color);
          box-shadow: 0 0 0 1px #fff;
        }
        .medication-caption {
          display: flex;
          align-items: baseline;
          gap: 2px;
          min-width: 0;
          margin-top: 0;
          font-size: 6px;
          line-height: 1.05;
          color: var(--medication-color);
        }
        .medication-caption strong,
        .medication-caption span {
          display: inline;
          white-space: nowrap;
        }
        .medication-caption strong {
          font-weight: 700;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
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
          margin: 0 0 1px;
          font-size: 14px;
          color: var(--blue);
        }
        .analysis-header p {
          margin: 0;
          font-size: 9px;
          color: var(--muted);
        }
        .analysis-cards {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 4px;
          margin: 6px 0;
        }
        .analysis-card {
          border: 1px solid var(--line);
          background: #f8fbfe;
          padding: 4px 5px;
        }
        .analysis-card strong {
          font-size: 8px;
          margin-bottom: 1px;
        }
        .analysis-card span {
          display: block;
          font-size: 12px;
          font-weight: 700;
          color: var(--text);
        }
        .analysis-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 4px;
        }
        .analysis-panel {
          border: 1px solid var(--line);
          padding: 4px;
          background: white;
        }
        .analysis-panel h3 {
          margin: 0 0 3px;
          font-size: 11px;
          color: var(--blue);
        }
        .trend-table th,
        .trend-table td,
        .hour-summary-table th,
        .hour-summary-table td {
          font-size: 6px;
          padding-top: 0;
          padding-bottom: 0;
          line-height: 1.05;
        }
        .trend-table th,
        .hour-summary-table th {
          background: #eef5fb;
          color: var(--blue);
          text-align: left;
          padding-left: 4px;
        }
        .trend-table td:first-child,
        .hour-summary-table td:first-child {
          text-align: left;
          padding-left: 4px;
        }
        .hour-summary-table thead th {
          text-align: center;
          padding-left: 0;
          vertical-align: middle;
        }
        .hour-summary-table th:nth-child(1) { width: 5%; }
        .histogram-spacer-head,
        .histogram-spacer-cell {
          width: 8px;
          min-width: 8px;
          background: white !important;
          border-left: 0 !important;
          border-right: 0 !important;
        }
        .histogram-cell {
          padding: 0;
          text-align: center;
          vertical-align: bottom;
        }
        .histogram-cell-inner {
          display: flex;
          align-items: end;
          justify-content: center;
          width: calc(100% - 2px);
          height: 20px;
          margin: 1px 0;
          background: #f7fafc;
          border: 1px solid var(--line-soft);
          overflow: hidden;
        }
        .mini-cylinder-fill {
          display: block;
          width: 100%;
        }
        .mini-cylinder-fill.is-peak {
          opacity: 1;
          box-shadow: inset 0 0 0 0.3mm rgba(52, 73, 94, 0.32);
          filter: saturate(1.2) brightness(0.95);
        }
        .mini-cylinder-fill.is-secondary {
          opacity: 0.82;
          background-image: repeating-linear-gradient(
            -45deg,
            rgba(255, 255, 255, 0.28) 0,
            rgba(255, 255, 255, 0.28) 1.2px,
            transparent 1.2px,
            transparent 2.6px
          );
        }
        .compact-week-cell {
          padding: 0;
          text-align: center;
          vertical-align: bottom;
        }
        .compact-week-cell.has-plan-change,
        .hour-summary-table th.has-plan-change {
          border-left: 2px solid #a45d25;
          background: #fff5e9;
        }
        .plan-change-symbol {
          display: block;
          color: #a45d25;
          font-size: 5px;
          line-height: 1;
        }
        .compact-week-inner {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          align-items: end;
          gap: 1px;
          width: calc(100% - 2px);
          height: 20px;
          margin: 1px 0;
          padding: 0 1px;
          background: #f7fafc;
          border: 1px solid var(--line-soft);
          overflow: hidden;
          box-sizing: border-box;
        }
        .compact-week-bar-shell {
          display: flex;
          align-items: end;
          height: 100%;
        }
        .compact-week-bar {
          display: block;
          width: 100%;
          border: 1px solid currentColor;
          border-bottom: 0;
        }
        .compact-week-bar.state-on {
          color: var(--on-border);
          background: var(--on-border);
        }
        .compact-week-bar.state-partial {
          color: var(--partial-border);
          background: var(--partial-border);
        }
        .compact-week-bar.state-off {
          color: var(--off-border);
          background: var(--off-border);
        }
        .compact-week-bar.state-dyskinesia {
          color: var(--dyskinesia-border);
          background: var(--dyskinesia-border);
        }
        .compact-week-bar.state-sleep {
          color: var(--sleep-border);
          background: var(--sleep-border);
        }
        .charts-page {
          padding: 7px 9px;
        }
        .charts-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 3px;
        }
        .charts-header h2 {
          margin: 0;
          font-size: 13px;
          color: var(--blue);
        }
        .chart-legend {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 3px 8px;
          max-width: 62%;
          font-size: 7px;
          color: var(--muted);
        }
        .chart-legend span {
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }
        .chart-legend i {
          display: inline-block;
          width: 10px;
          height: 2px;
        }
        .chart-legend .plan-change-line {
          width: 2px;
          height: 9px;
          background: #a45d25;
        }
        .weekly-charts {
          display: grid;
          gap: 2px;
        }
        .weekly-hour-chart {
          border: 1px solid var(--line-soft);
          page-break-inside: avoid;
          padding: 2px 4px 0;
        }
        .weekly-hour-chart h3 {
          margin: 0;
          font-size: 8px;
          color: var(--blue);
        }
        .weekly-hour-chart svg {
          display: block;
          width: 100%;
          height: 29mm;
        }
        .chart-grid-line {
          stroke: #dce5ec;
          stroke-width: 1;
        }
        .chart-axis-label {
          fill: var(--muted);
          font-size: 10px;
        }
        .chart-plan-change {
          stroke: #a45d25;
          stroke-width: 2;
          stroke-dasharray: 5 3;
        }
        .chart-state-line {
          stroke-width: 2.5;
          stroke-linejoin: round;
          stroke-linecap: round;
        }
        .state-on { background: #d9ebf8; }
        .state-partial { background: #f8e7b7; }
        .state-off { background: #f6c9c9; }
        .state-dyskinesia { background: #ead8ff; }
        .state-sleep { background: #e7edf2; }
        @media print {
          html, body {
            width: auto;
            height: auto;
          }
          .page {
            gap: 0;
            width: auto;
            margin: 0;
          }
          .sheet {
            min-height: calc(210mm - 16mm);
          }
          .analysis-page {
            width: auto;
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
              <h1>Hodnocení vlastního stavu hybnosti a rozpis léčby</h1>
            </div>
            <section class="header-side">
              <div class="meta-cell">
                <span class="meta-label">Období</span>
                <div class="meta-value compact">
                  ${escapeHtml(formatNumericDate(dateKeys[0]))} - ${escapeHtml(formatNumericDate(reportEndDate))}
                </div>
              </div>
              <div class="meta-cell">
                <span class="meta-label">Vygenerováno</span>
                <div class="meta-value">${escapeHtml(generatedAt)}</div>
              </div>
              <div class="meta-cell">
                <span class="meta-label">Jmeno</span>
                <div class="meta-value">${escapeHtml(patientName || "Neuvedeno")}</div>
              </div>
              <div class="meta-cell">
                <span class="meta-label">Rok narození</span>
                <div class="meta-value">${escapeHtml(birthYear || "Neuvedeno")}</div>
              </div>
            </section>
          </header>

          <section class="content">
            ${dateKeys.map((dateKey) => buildDayTable(dateKey, entries[dateKey], medicationColorMap)).join("")}

            <p class="footer">NeuroDiary · tiskovy report pro lekare</p>
          </section>
        </section>

        ${buildAnalysisPage(entries, reportEndDate)}

      </main>
    </body>
  </html>`;
}

export function openDoctorReportPrint({
  entries,
  treatmentPlan,
  selectedDate,
  patientName,
  birthYear,
  includeToday = true,
  skipEmptyDays = true,
}) {
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    throw new Error("Okno reportu se nepodařilo otevřít.");
  }

  const html = buildDoctorReportHtml({
    entries,
    treatmentPlan,
    selectedDate,
    patientName,
    birthYear,
    includeToday,
    skipEmptyDays,
  });
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

export async function createDoctorReportPdfBlob(options) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const html = buildDoctorReportHtml(options);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.left = "-12000px";
  frame.style.top = "0";
  frame.style.width = "1123px";
  frame.style.height = "794px";
  document.body.appendChild(frame);

  try {
    frame.contentDocument.open();
    frame.contentDocument.write(html);
    frame.contentDocument.close();
    await frame.contentDocument.fonts?.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const sheets = [...frame.contentDocument.querySelectorAll("main.page > .sheet")];
    if (!sheets.length) {
      throw new Error("Report neobsahuje žádné strany.");
    }
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
    for (let index = 0; index < sheets.length; index += 1) {
      const canvas = await html2canvas(sheets[index], {
        backgroundColor: "#ffffff",
        scale: 1.35,
        logging: false,
        useCORS: true,
      });
      if (index > 0) pdf.addPage("a4", "landscape");
      const maxWidth = 281;
      const maxHeight = 194;
      const ratio = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
      const width = canvas.width * ratio;
      const height = canvas.height * ratio;
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", (297 - width) / 2, 8, width, height);
    }
    return pdf.output("blob");
  } finally {
    frame.remove();
  }
}

export async function downloadDoctorReportPdf(options) {
  const blob = await createDoctorReportPdfBlob(options);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `neurodiary-report-${options.selectedDate || "report"}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
