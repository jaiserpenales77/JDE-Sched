import { useRef, useState } from "react";
import type {
  ChangeoverClock,
  LineStatusPick,
  RunStatus,
  ScheduleLineSetup,
  SchedulePrintSettings,
  ScheduleRunSettings,
  WorkOrder,
} from "../types";
import { RUN_STATUSES } from "../types";
import {
  groupByLine,
  percentActual,
  bottlesRemaining,
  changeoverInto,
  capChangeInto,
  CAP_CHANGE_REMARK,
  rowHighlightClass,
  newBlankWorkOrder,
  orderedScheduleColumns,
  SCHEDULE_COLUMN_LABELS,
  SHIFT_HOURS,
  formatClock,
  parseClock,
} from "../scheduleLogic";
import { asOfNow, defaultLineSetup, LINE_NOTE_MAX, lineKey, lineNumber, PM_PREP_NOTE, whenText } from "../scheduleRun";
import { compareKeys, planShiftLabel } from "../linePlan";
import type { WeekPlan } from "../linePlan";
import type { ScheduleLine } from "../scheduleRun";
import type { AllergenList, CottonList, DesiccantList } from "../hubData";
import ProgressBar from "./ProgressBar";
import { PrintSchedule } from "./PrintViews";
import SchedulePrintDesign from "./SchedulePrintDesign";
import { BOX_COLUMNS, STATUS_CLASS } from "../scheduleBoxes";
import type { BoxesView } from "../scheduleBoxes";

interface Props {
  workOrders: WorkOrder[];
  setWorkOrders: (updater: (wos: WorkOrder[]) => WorkOrder[]) => void;
  // Each line's status this shift and next, breaks and crew; the time the
  // schedule is from; and the estimate and washroom settings.
  setLineSetups: (updater: (lines: ScheduleLineSetup[]) => ScheduleLineSetup[]) => void;
  scheduleAsOf: string;
  setScheduleAsOf: (asOf: string) => void;
  runSettings: ScheduleRunSettings;
  setRunSettings: (updater: (s: ScheduleRunSettings) => ScheduleRunSettings) => void;
  // The schedule with each line's status and estimated times.
  scheduleLines: ScheduleLine[];
  // The Hub's cotton list (FG item -> "Yes" or the cotton it takes), shown
  // in a blank Cotton box.
  hubCotton: CottonList;
  // The Hub's desiccant list, the same way, shown in a blank Desiccant box.
  hubDesiccant: DesiccantList;
  // The Hub's allergen list (FG item -> its code), shown in a blank Allergen box.
  hubAllergen: AllergenList;
  // The shared week plan, this shift's key in it, and importing a new one.
  weekPlan: WeekPlan | null;
  planKey: string;
  onImportPlan: (file: File) => Promise<string>;
  // What the printout shows (see App.tsx), for the preview.
  printData: {
    workOrders: WorkOrder[];
    scheduledLines: string[];
    changeoverTimes: Record<string, string>;
    boxes: BoxesView;
  };
  columnWidths: Record<string, number>;
  setColumnWidths: (updater: (widths: Record<string, number>) => Record<string, number>) => void;
  hiddenColumns: string[];
  setHiddenColumns: (updater: (cols: string[]) => string[]) => void;
  columnOrder: string[];
  setColumnOrder: (order: string[]) => void;
  design: SchedulePrintSettings;
  setDesign: (updater: (s: SchedulePrintSettings) => SchedulePrintSettings) => void;
  // When the shift starts, and its break and lunch hours.
  changeoverClock: ChangeoverClock;
  setChangeoverClock: (clock: ChangeoverClock) => void;
}

const COLUMNS: { key: keyof WorkOrder; label: string; width?: string; numeric?: boolean }[] = [
  { key: "wo", label: "WO #" },
  { key: "seq", label: "Seq" },
  { key: "item", label: "Item" },
  { key: "description", label: "Product Description" },
  { key: "count", label: "Count" },
  { key: "bulkItem", label: "Bulk Item" },
  { key: "bottleSize", label: "Bottle Size" },
  { key: "capDescription", label: "Cap Description" },
  { key: "allergen", label: "Allergen" },
  { key: "remarks", label: "Remarks" },
  { key: "woQuantity", label: "WO Qty", numeric: true },
  { key: "percentComplete", label: "% Complete", numeric: true },
  { key: "desiccant", label: "Desiccant" },
  { key: "cotton", label: "Cotton" },
];

function fmtChg(code: string) {
  return code === "" ? "—" : code;
}

// Seq box that only applies the new number when you leave it (or press
// Enter) - rows are listed in Seq order, so applying every keystroke would
// make the row jump around while you type.
function SeqInput({ value, onCommit }: { value: string; onCommit: (seq: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  // Escape blurs to cancel - the blur runs before the cleared draft renders.
  const cancelled = useRef(false);
  return (
    <input
      type="text"
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (!cancelled.current && draft !== null && draft !== value) onCommit(draft);
        cancelled.current = false;
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

// Whether the Print Report Preview is open - remembered per device, open
// by default.
const SHOW_PREVIEW_KEY = "jde-sched-show-schedule-preview";

function loadShowPreview(): boolean {
  try {
    return localStorage.getItem(SHOW_PREVIEW_KEY) !== "0";
  } catch {
    return true;
  }
}

const STATUS_WORDS: Record<RunStatus, string> = {
  RUNNING: "Running",
  "PARTIAL SHIFT": "Partial shift",
  OVERTIME: "Overtime",
  "READY LINE": "Ready line",
  "PM / CLEANING": "PM / Cleaning",
  "NOT SCHEDULED": "Not scheduled",
};

// A line's status this shift or next. Auto = this shift: the file's Line
// Status (Ready, PM, OT), else Not scheduled; next shift: Not scheduled.
function StatusSelect({
  id,
  label,
  value,
  auto,
  onChange,
  className = "",
}: {
  id?: string;
  label: string;
  value: LineStatusPick;
  auto: RunStatus | "";
  onChange: (value: LineStatusPick) => void;
  className?: string;
}) {
  const shown = value === "NONE" ? "" : value || auto;
  return (
    <select
      id={id}
      aria-label={label}
      title={label}
      className={`run-pick run-pick-${shown ? STATUS_CLASS[shown] : "none"} ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value as LineStatusPick)}
    >
      <option value="">{auto ? `Auto: ${STATUS_WORDS[auto]}` : "Auto: no status"}</option>
      {RUN_STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_WORDS[s]}
        </option>
      ))}
      <option value="NONE">No status</option>
    </select>
  );
}

// Short names on the status buttons (full, and next shift's smaller ones).
const CHIP_WORDS: Record<RunStatus, [string, string]> = {
  RUNNING: ["Running", "Run"],
  "PARTIAL SHIFT": ["Partial", "Part"],
  OVERTIME: ["OT", "OT"],
  "READY LINE": ["Ready", "Rdy"],
  "PM / CLEANING": ["PM", "PM"],
  "NOT SCHEDULED": ["Off", "Off"],
};

// A line's status as a row of colored buttons, in the printout's colors:
// one click picks it. A status that isn't picked (Auto) shows with a
// dashed outline; "No status" shows none.
function StatusChips({
  label,
  value,
  auto,
  autoNote,
  small = false,
  onChange,
}: {
  label: string;
  value: LineStatusPick;
  auto: RunStatus | "";
  autoNote: string;
  small?: boolean;
  onChange: (value: RunStatus) => void;
}) {
  const shown = value === "NONE" ? "" : value || auto;
  return (
    <span className={`run-chips${small ? " run-chips-small" : ""}`} role="radiogroup" aria-label={label}>
      {RUN_STATUSES.map((st) => {
        const on = shown === st;
        const isAuto = on && !value;
        return (
          <button
            key={st}
            type="button"
            role="radio"
            aria-checked={on}
            data-status={st}
            data-auto={isAuto ? "1" : undefined}
            className={`run-chip run-chip-${STATUS_CLASS[st]}${on ? (isAuto ? " auto" : " on") : ""}`}
            title={isAuto ? `${STATUS_WORDS[st]}, automatically (${autoNote}). Click to pick it.` : STATUS_WORDS[st]}
            onClick={() => onChange(st)}
          >
            {CHIP_WORDS[st][small ? 1 : 0]}
          </button>
        );
      })}
    </span>
  );
}

// A number box that saves when you leave it (or press Enter), so clearing
// it to type a new number doesn't save a 0 on the way.
function DraftNumber({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  allowBlank = false,
  onCommit,
}: {
  id?: string;
  label?: string;
  value: number | null;
  min: number;
  max: number;
  step?: number;
  allowBlank?: boolean;
  onCommit: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  function commit() {
    if (draft === null) return;
    const text = draft.trim();
    const n = Number(text);
    if (text === "" ? allowBlank : Number.isFinite(n) && n >= min && n <= max) onCommit(text === "" ? null : n);
    setDraft(null);
  }
  return (
    <input
      id={id}
      aria-label={label}
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft ?? (value ?? "")}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

// A text box that saves when you leave it.
function DraftText({
  id,
  value,
  onCommit,
  label,
  placeholder,
  maxLength,
  className,
}: {
  id?: string;
  value: string;
  onCommit: (value: string) => void;
  label?: string;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      id={id}
      type="text"
      aria-label={label}
      placeholder={placeholder}
      maxLength={maxLength}
      className={className}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== value) onCommit(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

// Each line's status this shift and next and its note - the workbook's 3.
// Lines - and the time the schedule is from.
function LinesPanel({
  lines,
  setLineSetups,
  scheduleAsOf,
  setScheduleAsOf,
  boxes,
  weekPlan,
  planKey,
  onImportPlan,
}: {
  lines: ScheduleLine[];
  setLineSetups: (updater: (lines: ScheduleLineSetup[]) => ScheduleLineSetup[]) => void;
  scheduleAsOf: string;
  setScheduleAsOf: (asOf: string) => void;
  boxes: BoxesView;
  weekPlan: WeekPlan | null;
  planKey: string;
  onImportPlan: (file: File) => Promise<string>;
}) {
  const planInput = useRef<HTMLInputElement>(null);
  const [planMsg, setPlanMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [importing, setImporting] = useState(false);
  const planCovers = !!planKey && !!weekPlan?.shifts[planKey];
  const planKeys = weekPlan ? Object.keys(weekPlan.shifts).sort(compareKeys) : [];
  // Saves a change to some lines' setups, worked out from each one's
  // current setup (so quick clicks on + add up).
  function update(
    targets: ScheduleLine[],
    patch: (setup: ScheduleLineSetup, line: ScheduleLine) => Partial<ScheduleLineSetup>,
  ) {
    setLineSetups((all) => {
      const next = [...all];
      for (const line of targets) {
        const key = lineKey(line.line);
        const i = next.findIndex((s) => lineKey(s.name) === key);
        const current = i >= 0 ? next[i] : line.setup;
        const p = patch(current, line);
        // A status pick is for this shift: a pick from an earlier shift that
        // no longer counts is dropped, so it can't come back.
        const picking = "thisShift" in p || "nextShift" in p;
        const base = picking && planKey ? { ...current, ...line.picks, pickedFor: planKey } : current;
        const changed = { ...base, ...p };
        if (i >= 0) next[i] = changed;
        else next.push(changed);
      }
      return next;
    });
  }
  return (
    <div className="panel run-lines-panel">
      <h2>Lines</h2>
      <p className="panel-hint">
        Each line's status this shift and next shift, as on the printout. Running, Partial shift and Overtime lines get
        estimated times. With a <strong>week plan</strong> imported, the statuses fill in from it for every shift (a
        dashed outline); click a status to change it for this shift. Then click <strong>Set to now</strong>: until
        Schedule as of is today, the printout shows a red CHECK in place of its summary.
      </p>
      <div className="run-plan">
        <button className="btn" disabled={importing} onClick={() => planInput.current?.click()}>
          📅 Import week plan
        </button>
        <input
          ref={planInput}
          type="file"
          accept=".xlsx,.xlsm,.xls"
          aria-label="Week plan file"
          style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setImporting(true);
            setPlanMsg(null);
            try {
              setPlanMsg({ text: await onImportPlan(file), ok: true });
            } catch (err) {
              setPlanMsg({ text: err instanceof Error ? err.message : String(err), ok: false });
            } finally {
              setImporting(false);
            }
          }}
        />
        <span className="run-plan-state" role="status">
          {weekPlan && planKeys.length ? (
            <>
              Week plan: {planShiftLabel(planKeys[0])} to {planShiftLabel(planKeys[planKeys.length - 1])}
              {weekPlan.importedBy ? `, imported by ${weekPlan.importedBy} shift` : ""}
              {weekPlan.importedAt ? ` on ${new Date(weekPlan.importedAt).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}
              {planKey ? (planCovers ? ` · this shift (${planShiftLabel(planKey)}) is in it` : ` · this shift (${planShiftLabel(planKey)}) isn't in it`) : ""}
            </>
          ) : (
            "No week plan yet: import the weekly packaging schedule (its Daily Line Sched sheet) to fill in the statuses for every shift."
          )}
        </span>
        {planMsg && <span className={planMsg.ok ? "run-plan-ok" : "run-plan-err"}>{planMsg.text}</span>}
      </div>
      <div className="run-asof">
        <label className="estimate-field" htmlFor="sched-asof">
          Schedule as of
          <input
            id="sched-asof"
            type="datetime-local"
            value={scheduleAsOf}
            onChange={(e) => setScheduleAsOf(e.target.value)}
          />
        </label>
        <button className="btn primary" onClick={() => setScheduleAsOf(asOfNow())}>
          🕒 Set to now
        </button>
        <span className="run-asof-end">
          {scheduleAsOf ? "" : "Not set, so the times count from now. "}This shift ends {whenText(boxes.end, boxes.asOf)}.
        </span>
      </div>
      {boxes.check ? (
        <p className="run-check" role="status">
          ⚠ {boxes.check}
        </p>
      ) : (
        <p className="run-ok" role="status">
          ✓ Dated today. {boxes.summary.text}
        </p>
      )}
      <div className="run-bulk">
        <button className="btn small" onClick={() => update(lines, () => ({ thisShift: "RUNNING" }))}>
          This shift: all Running
        </button>
        <button
          className="btn small"
          onClick={() => update(lines, (_s, l) => ({ nextShift: l.status || "NONE" }))}
          title="Next shift's status for each line = its status this shift"
        >
          Next shift = this shift
        </button>
        <button className="btn small" onClick={() => update(lines, () => ({ thisShift: "", nextShift: "" }))}>
          Clear statuses
        </button>
      </div>
      <div className="schedule-table-wrap">
        <table className="run-lines">
          <thead>
            <tr>
              <th>Line</th>
              <th>This shift</th>
              <th>Next shift</th>
              <th>Line note</th>
              <th>Running WO done</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const first = line.rows[0]?.estimate;
              return (
                <tr key={line.line} className={`run-line run-line-${line.status ? STATUS_CLASS[line.status] : "none"}`}>
                  <th scope="row">
                    <span className="run-line-name">{line.name}</span>
                    {line.name.toUpperCase() !== line.line.toUpperCase() && (
                      <span className="run-line-file">{line.line}</span>
                    )}
                  </th>
                  <td>
                    <StatusChips
                      label={`${line.name} this shift`}
                      value={line.picks.thisShift}
                      auto={line.auto.thisShift}
                      autoNote={line.auto.thisFromPlan ? "from the week plan" : "from the file's Line Status, else Off"}
                      onChange={(v) => update([line], () => ({ thisShift: v }))}
                    />
                  </td>
                  <td>
                    <StatusChips
                      label={`${line.name} next shift`}
                      value={line.picks.nextShift}
                      auto={line.auto.nextShift || "NOT SCHEDULED"}
                      autoNote={line.auto.nextFromPlan ? "from the week plan" : "not picked yet"}
                      small
                      onChange={(v) => update([line], () => ({ nextShift: v }))}
                    />
                  </td>
                  <td className="run-note">
                    <DraftText
                      label={`${line.name} note`}
                      placeholder="Note for the printout"
                      maxLength={LINE_NOTE_MAX}
                      className="run-note-input"
                      value={line.setup.note}
                      onCommit={(v) => update([line], () => ({ note: v.replace(/\s+/g, " ").trim() }))}
                    />
                    {line.lineNotes.includes(PM_PREP_NOTE) && (
                      <span className="run-note-auto" title={PM_PREP_NOTE}>
                        + PM prep note (next shift is PM)
                      </span>
                    )}
                  </td>
                  <td className="run-est">
                    {!line.runs ? (
                      <span className="run-muted">Not running</span>
                    ) : first?.done ? (
                      whenText(first.done, boxes.asOf)
                    ) : (
                      <span className="run-missing">{first?.missing === "no qty" ? "No WO Qty" : "No line rate"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// When the shift starts and which of its hours have breaks and lunch, and
// the rest of what the estimated times and the washroom prep list use (the
// workbook's 5. Settings).
function EstimateSettings({
  clock,
  setClock,
  settings,
  setSettings,
}: {
  clock: ChangeoverClock;
  setClock: (clock: ChangeoverClock) => void;
  settings: ScheduleRunSettings;
  setSettings: (updater: (s: ScheduleRunSettings) => ScheduleRunSettings) => void;
}) {
  const start = parseClock(clock.start);
  const hours = Array.from({ length: SHIFT_HOURS }, (_, i) => i + 1);
  const setBreak = (i: number, hour: number) => {
    const next = [clock.breakHours[0] ?? 0, clock.breakHours[1] ?? 0];
    next[i] = hour;
    setClock({ ...clock, breakHours: next.filter(Boolean) });
  };
  const hourSelect = (id: string, label: string, value: number, onChange: (hour: number) => void) => (
    <label className="estimate-field" htmlFor={id}>
      {label}
      <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={0}>None</option>
        {hours.map((h) => (
          <option key={h} value={h}>
            Hour {h} ({formatClock(start + (h - 1) * 60)})
          </option>
        ))}
      </select>
    </label>
  );
  const percent = (share: number) => Math.round(share * 1000) / 10;
  const percentField = (id: string, label: string, value: number, min: number, max: number, onCommit: (share: number) => void) => (
    <label className="estimate-field" htmlFor={id}>
      {label}
      <DraftNumber id={id} value={percent(value)} min={min} max={max} step={0.1} onCommit={(n) => n !== null && onCommit(n / 100)} />
    </label>
  );
  const CO_FIELDS: { key: keyof ScheduleRunSettings["changeoverMinutes"]; label: string }[] = [
    { key: "s1", label: "S1 (minutes)" },
    { key: "count", label: "Count change" },
    { key: "s3", label: "S3" },
    { key: "s4", label: "S4" },
  ];
  return (
    <div className="panel estimate-settings">
      <h2>Estimated times</h2>
      <p className="panel-hint">
        Every work order on a line that runs this shift (Running, Partial shift or Overtime) gets an estimated time:
        from Schedule as of, the changeover minutes before each work order, then its bottles left (WO Qty less %
        Complete) at the line's Full Hour rate for that FG item from the Packaging Lead Hub's Line Rates, times the
        line efficiency. Lines 1 to 7 stop for breaks and lunch (Lines 8 and up run through them): there, the break
        hours and the lunch hour make only their share of a full hour's bottles; past the end of the shift the times carry on with the same hours. A work order
        with no rate or WO Qty stops the times below it.
      </p>
      <div className="estimate-fields">
        <label className="estimate-field" htmlFor="co-start">
          Shift starts
          <input
            id="co-start"
            type="time"
            value={clock.start}
            onChange={(e) => e.target.value && setClock({ ...clock, start: e.target.value })}
          />
        </label>
        {hourSelect("co-break-1", "Break", clock.breakHours[0] ?? 0, (h) => setBreak(0, h))}
        {hourSelect("co-break-2", "Second break", clock.breakHours[1] ?? 0, (h) => setBreak(1, h))}
        {hourSelect("co-lunch", "Lunch", clock.lunchHour, (h) => setClock({ ...clock, lunchHour: h }))}
        {percentField("run-break-share", "A break hour makes (%)", settings.breakShare, 0, 100, (v) =>
          setSettings((s) => ({ ...s, breakShare: v })),
        )}
        {percentField("run-lunch-share", "The lunch hour makes (%)", settings.lunchShare, 0, 100, (v) =>
          setSettings((s) => ({ ...s, lunchShare: v })),
        )}
        {percentField("run-efficiency", "Line efficiency (%)", settings.efficiency, 5, 200, (v) =>
          setSettings((s) => ({ ...s, efficiency: v })),
        )}
      </div>
      <div className="estimate-subhead">Changeover minutes</div>
      <div className="estimate-fields">
        {CO_FIELDS.map(({ key, label }) => (
          <label className="estimate-field estimate-narrow" htmlFor={`run-co-${key}`} key={key}>
            {label}
            <DraftNumber
              id={`run-co-${key}`}
              value={settings.changeoverMinutes[key]}
              min={0}
              max={600}
              onCommit={(n) =>
                n !== null && setSettings((s) => ({ ...s, changeoverMinutes: { ...s.changeoverMinutes, [key]: n } }))
              }
            />
          </label>
        ))}
      </div>
      <div className="estimate-subhead">Washroom prep list</div>
      <div className="estimate-fields">
        <label className="estimate-field" htmlFor="run-cremer">
          Cremer filler lines
          <DraftText id="run-cremer" value={settings.cremerLines} onCommit={(v) => setSettings((s) => ({ ...s, cremerLines: v }))} />
        </label>
        <label className="estimate-field" htmlFor="run-merrill">
          Merrill filler lines
          <DraftText id="run-merrill" value={settings.merrillLines} onCommit={(v) => setSettings((s) => ({ ...s, merrillLines: v }))} />
        </label>
        <label className="estimate-field estimate-wide" htmlFor="run-oily">
          Oily when the description has the word
          <DraftText
            id="run-oily"
            value={settings.oilyWords.join(", ")}
            onCommit={(v) =>
              setSettings((s) => ({
                ...s,
                oilyWords: v
                  .split(",")
                  .map((w) => w.trim())
                  .filter(Boolean)
                  .slice(0, 12),
              }))
            }
          />
        </label>
      </div>
    </div>
  );
}

export default function ProductionSchedule({
  workOrders,
  setWorkOrders,
  setLineSetups,
  scheduleAsOf,
  setScheduleAsOf,
  runSettings,
  setRunSettings,
  scheduleLines,
  printData,
  hubCotton,
  hubDesiccant,
  hubAllergen,
  weekPlan,
  planKey,
  onImportPlan,
  columnWidths,
  setColumnWidths,
  hiddenColumns,
  setHiddenColumns,
  columnOrder,
  setColumnOrder,
  design,
  setDesign,
  changeoverClock,
  setChangeoverClock,
}: Props) {
  const changeoverTimes = printData.changeoverTimes;
  const boxesDesign = design.tableStyle === "boxes";
  const lineOf = new Map(scheduleLines.map((l) => [l.line, l]));
  const [newLineName, setNewLineName] = useState("");
  const groups = groupByLine(workOrders);
  const [showPreview, setShowPreview] = useState(loadShowPreview);

  function togglePreview(show: boolean) {
    setShowPreview(show);
    try {
      localStorage.setItem(SHOW_PREVIEW_KEY, show ? "1" : "0");
    } catch {
      // Not remembered on this device - the toggle still works.
    }
  }

  function toggleHiddenColumn(key: string, hidden: boolean) {
    setHiddenColumns((cols) => (hidden ? [...cols, key] : cols.filter((c) => c !== key)));
  }

  // This shift's status for a line, from its header.
  function setThisShift(line: ScheduleLine, status: LineStatusPick) {
    const key = lineKey(line.line);
    // A pick for this shift (see the Lines panel's update).
    const picked = (s: ScheduleLineSetup) => (planKey ? { ...s, ...line.picks, pickedFor: planKey } : s);
    setLineSetups((all) =>
      all.some((s) => lineKey(s.name) === key)
        ? all.map((s) => (lineKey(s.name) === key ? { ...picked(s), thisShift: status } : s))
        : [...all, { ...picked(line.setup), thisShift: status }],
    );
  }

  function updateRow(id: string, field: keyof WorkOrder, value: string | number) {
    setWorkOrders((wos) => wos.map((w) => (w.id === id ? { ...w, [field]: value } : w)));
  }

  function insertAfter(id: string) {
    setWorkOrders((wos) => {
      const idx = wos.findIndex((w) => w.id === id);
      if (idx === -1) return wos;
      const blank = newBlankWorkOrder(wos[idx].line);
      const next = [...wos];
      next.splice(idx + 1, 0, blank);
      return next;
    });
  }

  // A new work order goes at the bottom of its line: saved right after the
  // line's last row (in Seq order), which is where a row with no Seq shows.
  function addToEnd(line: string, lastId: string | undefined) {
    setWorkOrders((wos) => {
      const idx = lastId ? wos.findIndex((w) => w.id === lastId) : -1;
      if (idx === -1) return [...wos, newBlankWorkOrder(line)];
      const next = [...wos];
      next.splice(idx + 1, 0, newBlankWorkOrder(line));
      return next;
    });
  }

  function deleteRow(id: string) {
    setWorkOrders((wos) => wos.filter((w) => w.id !== id));
  }

  function deleteLine(line: string) {
    if (!confirm(`Remove line "${line}" and all its work orders?`)) return;
    setWorkOrders((wos) => wos.filter((w) => w.line.trim() !== line));
  }

  function renameLine(oldLine: string, newLine: string) {
    setWorkOrders((wos) => wos.map((w) => (w.line.trim() === oldLine ? { ...w, line: newLine } : w)));
    // The line's statuses go with it to its new number (unless that number
    // already has its own).
    const from = lineKey(oldLine);
    const to = lineKey(newLine);
    if (from !== to && lineNumber(oldLine) !== null && lineNumber(newLine) !== null) {
      setLineSetups((all) =>
        all.some((s) => lineKey(s.name) === to)
          ? all
          : all.map((s) => (lineKey(s.name) === from ? { ...s, name: defaultLineSetup(newLine).name } : s)),
      );
    }
  }

  function addNewLine() {
    const name = newLineName.trim();
    if (!name) return;
    setWorkOrders((wos) => [...wos, newBlankWorkOrder(name)]);
    setNewLineName("");
  }

  function clearAll() {
    if (!confirm("This will permanently clear all work order data. Continue?")) return;
    setWorkOrders(() => []);
  }

  return (
    <div>
      <div className="legend">
        <span className="swatch" style={{ background: "#f8cbad" }} /> Allergen (not "N") &nbsp;
        <span className="swatch" style={{ background: "#fff2cc" }} /> Oily product &nbsp;
        <span className="swatch" style={{ background: "#bdd7ee" }} /> Bulk item A662 / A624
        <br />
        Line status (pick it in Lines):{" "}
        {RUN_STATUSES.map((st) => (
          <span key={st} className="legend-status">
            <span className={`swatch run-swatch-${STATUS_CLASS[st]}`} />
            {STATUS_WORDS[st]}
          </span>
        ))}
        <br />
        Changeover: <span className="chg-S1">S1</span> = same setup ·{" "}
        <span className="chg-S1-Count-Change">S1 Count Change</span> = count differs ·{" "}
        <span className="chg-S3">S3</span> = bulk item differs · <span className="chg-S4">S4</span> = bottle size
        differs. Each code is shown on the work order the changeover happens on. % Actual Complete, Bottles Remaining
        and Changeover are calculated automatically.
      </div>

      {groups.length > 0 && (
        <LinesPanel
          lines={scheduleLines}
          setLineSetups={setLineSetups}
          scheduleAsOf={scheduleAsOf}
          setScheduleAsOf={setScheduleAsOf}
          boxes={printData.boxes}
          weekPlan={weekPlan}
          planKey={planKey}
          onImportPlan={onImportPlan}
        />
      )}

      <div className="panel">
        <button
          className="print-design-toggle"
          aria-expanded={showPreview}
          onClick={() => togglePreview(!showPreview)}
        >
          <h2 style={{ margin: 0 }}>🖨 Print Report Preview</h2>
          <span>{showPreview ? "▲ Hide" : "▼ Show"}</span>
        </button>
        {showPreview && (
          <div className="print-preview-body">
            {boxesDesign ? (
              <p className="panel-hint">
                Live preview of the printed Production Schedule, in the Line boxes design (pick another in Customize
                Print Design). Tick a column below to hide it; it's hidden in the other designs too.
              </p>
            ) : (
              <p className="panel-hint">
                Live preview of the printed Production Schedule. Drag a column's name to move it. To resize, drag
                the faint line on a column's edge (anywhere down the table) — double-click it to fit the column, or use
                Fit all columns. Tick a column below to hide it. All of these apply to the printout too. The printed
                column titles can be changed in Customize Print Design.
              </p>
            )}
            <div className="hide-columns-grid">
              {(boxesDesign
                ? BOX_COLUMNS.filter((c) => c.key !== "line").map((c) => ({ key: c.key as string, label: c.label }))
                : orderedScheduleColumns(columnOrder).map((key) => ({ key: key as string, label: SCHEDULE_COLUMN_LABELS[key] }))
              ).map(({ key, label }) => (
                <label className="hide-column-checkbox" key={key}>
                  <input
                    type="checkbox"
                    checked={hiddenColumns.includes(key)}
                    onChange={(e) => toggleHiddenColumn(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
              {!boxesDesign && columnOrder.length > 0 && (
                <button className="btn small" onClick={() => setColumnOrder([])}>
                  Reset column order
                </button>
              )}
            </div>
            <div className="print-preview-wrap">
              <PrintSchedule
                {...printData}
                columnWidths={columnWidths}
                setColumnWidths={setColumnWidths}
                hiddenColumns={hiddenColumns}
                columnOrder={columnOrder}
                setColumnOrder={setColumnOrder}
                design={design}
              />
            </div>
          </div>
        )}
      </div>

      {groups.length > 0 && (
        <EstimateSettings
          clock={changeoverClock}
          setClock={setChangeoverClock}
          settings={runSettings}
          setSettings={setRunSettings}
        />
      )}

      <SchedulePrintDesign settings={design} setSettings={setDesign} />

      {groups.length === 0 && (
        <div className="empty-state panel">No work orders yet. Add a production line below to get started.</div>
      )}

      {groups.map((group) => {
        const line = lineOf.get(group.line);
        const statusCls = line?.status ? STATUS_CLASS[line.status] : "none";
        return (
          <div className="line-group" key={group.line}>
            <div className={`line-group-header run-head-${statusCls}`}>
              <input
                className="line-name-input"
                value={group.line}
                onChange={(e) => renameLine(group.line, e.target.value)}
              />
              {line && (
                <StatusSelect
                  label={`${group.line} this shift`}
                  value={line.picks.thisShift}
                  auto={line.auto.thisShift}
                  onChange={(v) => setThisShift(line, v)}
                  className="run-pick-head"
                />
              )}
              <span style={{ flex: 1 }} />
              <button className="btn small danger" onClick={() => deleteLine(group.line)}>
                Remove line
              </button>
            </div>
            <div className="schedule-table-wrap">
              <table className="schedule">
                <thead>
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                    <th>Line Status</th>
                    <th>% Actual</th>
                    <th>Bottles Rem.</th>
                    <th>Changeover</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row, idx) => {
                    const chg = changeoverInto(group.rows, idx);
                    // A blank Allergen box takes the Hub's allergen, for the highlight too.
                    const listedAllergen = row.allergen.trim() ? "" : (hubAllergen[row.item.trim().toUpperCase()] ?? "");
                    const hl = rowHighlightClass(listedAllergen ? { ...row, allergen: listedAllergen } : row);
                    // On an "S1 Count Change" the count that changed is this
                    // row's own Count cell.
                    const countChanged = chg === "S1 Count Change";
                    // A blank Remarks box shows "Cap Change" (in gray) when the
                    // cap changes here; typing a remark replaces it.
                    const capChange = capChangeInto(group.rows, idx);
                    // A blank Cotton, Desiccant or Allergen box shows the Hub's
                    // list (in gray); typing in the box replaces it (N for none).
                    const listed = (key: string) => {
                      const list =
                        key === "cotton" ? hubCotton : key === "desiccant" ? hubDesiccant : key === "allergen" ? hubAllergen : null;
                      return list?.[row.item.trim().toUpperCase()];
                    };
                    return (
                      <tr key={row.id} className={hl}>
                        {COLUMNS.map((c) => (
                          <td key={c.key}>
                            {c.key === "seq" ? (
                              <SeqInput value={row.seq} onCommit={(seq) => updateRow(row.id, "seq", seq)} />
                            ) : (
                              <input
                                className={`${c.numeric ? "num" : ""} ${c.key === "count" && countChanged ? "count-changed" : ""}`}
                                type={c.numeric ? "number" : "text"}
                                placeholder={
                                  c.key === "remarks" && capChange
                                    ? CAP_CHANGE_REMARK
                                    : listed(c.key)
                                }
                                title={
                                  c.key === "remarks" && capChange && !row.remarks.trim()
                                    ? "The cap changes here. Prints as \"Cap Change\" unless you type a remark."
                                    : listed(c.key) && !String(row[c.key] ?? "").trim()
                                      ? `From the Hub's ${c.key} list: ${listed(c.key)}. Type here to change it for this work order (N for none).`
                                      : undefined
                                }
                                value={(row[c.key] ?? "") as string | number}
                                onChange={(e) =>
                                  updateRow(
                                    row.id,
                                    c.key,
                                    c.numeric ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value,
                                  )
                                }
                              />
                            )}
                          </td>
                        ))}
                        <td>
                          <select
                            value={row.lineStatus}
                            onChange={(e) => updateRow(row.id, "lineStatus", e.target.value)}
                          >
                            <option value="">—</option>
                            <option value="Ready">Ready</option>
                            <option value="PM">PM</option>
                            <option value="OT">OT</option>
                          </select>
                        </td>
                        <td className="computed">
                          <ProgressBar value={percentActual(row)} />
                        </td>
                        <td className="computed">{bottlesRemaining(row)}</td>
                        <td className={`changeover chg-${chg.replace(/ /g, "-")}`}>
                          {!chg && idx === 0 && changeoverTimes[group.line] ? (
                            <span className="co-estimate" title="Estimated changeover">
                              Est. {changeoverTimes[group.line]}
                            </span>
                          ) : (
                            fmtChg(chg)
                          )}
                        </td>
                        <td className="row-actions">
                          <button className="btn small" title="Insert row below" onClick={() => insertAfter(row.id)}>
                            + Row
                          </button>
                          <button className="btn small danger" title="Delete row" onClick={() => deleteRow(row.id)}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="line-group-footer">
              <button
                className="btn small"
                onClick={() => addToEnd(group.line, group.rows[group.rows.length - 1]?.id)}
              >
                + Add work order to {group.line}
              </button>
            </div>
          </div>
        );
      })}

      <div className="panel">
        <div className="new-line-bar">
          <input
            placeholder="New production line (e.g. VPKL02)"
            value={newLineName}
            onChange={(e) => setNewLineName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNewLine()}
          />
          <button className="btn primary" onClick={addNewLine}>
            + Add line
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn danger" onClick={clearAll}>
            🗑 Clear All Work Order Data
          </button>
        </div>
      </div>

    </div>
  );
}
