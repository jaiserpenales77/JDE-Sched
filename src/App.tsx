import { useEffect, useRef, useState } from "react";
import "./App.css";
import { useShiftData, useCurrentShift, seedDataForShift, emptyAppData } from "./storage";
import { lockApp, useShiftAuth } from "./auth";
import { rememberedUntil, rememberedUntilLabel } from "./rememberDevice";
import { IDLE_LOCK_MINUTES, useIdleLock } from "./useIdleLock";
import { useLineRates } from "./lineRates";
import { DEFAULT_SHIFT_START, changeoverEstimates } from "./scheduleLogic";
import UnlockScreen from "./components/UnlockScreen";
import { Brand } from "./components/LogoMark";
import ProductionSchedule from "./components/ProductionSchedule";
import LineAssignments from "./components/LineAssignments";
import SkillsRoles from "./components/SkillsRoles";
import TimeOff from "./components/TimeOff";
import ImportColumnsDialog from "./components/ImportColumnsDialog";
import PrintMenu from "./components/PrintMenu";
import TypeToConfirmDialog from "./components/TypeToConfirmDialog";
import type { PrintChoice } from "./components/PrintMenu";
import { todayIso } from "./timeOffLogic";
import { PrintSchedule, PrintAssignments } from "./components/PrintViews";
import {
  exportAppDataToJson,
  exportWorkOrdersToExcel,
  readAppDataFromJsonFile,
  readWorkbookSheets,
} from "./excel";
import type { WorkOrder, Employee, PrintAssignSettings, DailyBoard, SchedulePrintSettings, ShiftKey, TimeOffEntry } from "./types";
import { SHIFT_LABELS } from "./types";
import type { SheetGrid } from "./importColumns";

type Tab = "schedule" | "assignments" | "roster" | "timeoff";
type PrintReport = "assignments" | "schedule";
// "both" prints Line Assignments first, then the Production Schedule.
type PrintTarget = PrintChoice | null;
// What the Print button prints - remembered on this device separately for
// each shift, so shifts sharing a computer don't change each other's.
function printChoiceKey(shift: ShiftKey | null): string {
  return `jde-sched-print-choice-${shift ?? "none"}`;
}

function loadPrintChoice(shift: ShiftKey | null): PrintChoice {
  try {
    const saved = localStorage.getItem(printChoiceKey(shift));
    if (saved === "both" || saved === "assignments" || saved === "schedule") return saved;
  } catch {
    // Storage unavailable - fall back to the default.
  }
  return "both";
}

// How long Lock waits for the last change to reach the cloud.
const SAVE_BEFORE_LOCK_MS = 10_000;

function App() {
  // The shift this computer used last - picked first on the unlock screen.
  const [lastShift, rememberShift] = useCurrentShift();
  // Which shift's password this tab is unlocked with; nothing loads until
  // it is.
  const shiftAuth = useShiftAuth();
  const shift = shiftAuth.shift;
  const [data, setData, history, sync] = useShiftData(shift);
  const [locking, setLocking] = useState(false);
  // "Reset to sample data" / "Wipe all data" waiting for WIPE to be typed.
  const [eraseAction, setEraseAction] = useState<"reset" | "wipe" | null>(null);

  // auto: locking because nobody has used it for a while. Then a change
  // that can't be saved keeps it unlocked (it tries again) instead of
  // asking. Resolves whether it locked.
  async function lock(auto = false): Promise<boolean> {
    setLocking(true);
    try {
      // Send the last change before signing out, so it isn't left unsaved.
      // Offline, the save never finishes, so give up after a while.
      await Promise.race([
        sync.saveNow(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("No answer from the cloud")), SAVE_BEFORE_LOCK_MS)),
      ]);
    } catch (err) {
      console.error("Couldn't save before locking.", err);
      if (
        auto ||
        !confirm(
          "Your last change hasn't reached the cloud yet (no connection?). If you lock now it may be lost. Lock anyway?",
        )
      ) {
        setLocking(false);
        return false;
      }
    }
    await lockApp();
    setLocking(false);
    return true;
  }

  // Locks by itself after an hour without a click or key press, with a
  // one-minute "Still there?" warning first.
  const { idle, stayUnlocked } = useIdleLock(!!shift, () => lock(true));

  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo - except while typing
  // in a field, where the browser's own text undo should win.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        history.redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const {
    workOrders,
    employees,
    printSettings,
    scheduledLines,
    printScheduleColumnWidths,
    printScheduleHiddenColumns,
    printScheduleColumnOrder,
    boards,
    timeOff,
    schedulePrintSettings,
    importColumnMap,
  } = data;
  // Estimated changeover time on each line's running work order, from the
  // Hub's Line Rates and when this shift starts.
  const lineRates = useLineRates(!!shift);
  const changeoverClock = {
    ...data.changeoverClock,
    start: data.changeoverClock.start || DEFAULT_SHIFT_START[shift ?? "1st"],
  };
  // Only for the lines ticked in Scheduled Lines.
  const changeoverTimes = changeoverEstimates(workOrders, lineRates, changeoverClock, scheduledLines);
  const [tab, setTab] = useState<Tab>("schedule");
  const [selectedBoardId, setSelectedBoardId] = useState<string>("");
  const [printTarget, setPrintTarget] = useState<PrintTarget>(null);
  // Choices made since the page loaded, by shift; otherwise the saved one.
  const [printChoices, setPrintChoices] = useState<Partial<Record<ShiftKey, PrintChoice>>>({});
  const printChoice = (shift && printChoices[shift]) || loadPrintChoice(shift);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<{ fileName: string; sheets: SheetGrid[] } | null>(null);

  const sortedBoards = [...boards].sort((a, b) => (a.date < b.date ? 1 : -1));
  const today = todayIso();
  // Same board the Line Assignments tab shows: the one picked there, else
  // today's, else the newest.
  const selectedBoard =
    boards.find((b) => b.id === selectedBoardId) ?? boards.find((b) => b.date === today) ?? sortedBoards[0];

  function print(choice: PrintChoice) {
    if (shift) setPrintChoices((c) => ({ ...c, [shift]: choice }));
    try {
      localStorage.setItem(printChoiceKey(shift), choice);
    } catch {
      // Not remembered on this device - printing still works.
    }
    setPrintTarget(choice);
  }

  useEffect(() => {
    if (!printTarget) return;
    const reports: PrintReport[] = printTarget === "both" ? ["assignments", "schedule"] : [printTarget];
    for (const report of reports) document.body.classList.add(`printing-${report}`);

    // Each report prints on its own named page (see .print-slot-* in
    // App.css) with its own orientation / margins, so printing both keeps
    // each one's Customize Print Design settings. The plain @page is the
    // first report's, for browsers without named pages.
    const pageRules: string[] = [];
    const cleanups: (() => void)[] = [];
    // Look only inside the print area - the Production Schedule tab has a
    // live preview that also uses the .print-schedule class.
    const printRoot = document.querySelector(".print-root") as HTMLElement | null;

    reports.forEach((report, index) => {
      const design = report === "assignments" ? printSettings : schedulePrintSettings;
      const orientation = design.orientation;
      const marginMm = Math.min(30, Math.max(0, Number(design.printMarginMm) || 0));
      const pageRule = `size: ${orientation}; margin: ${marginMm}mm;`;
      if (index === 0) pageRules.push(`@page { ${pageRule} }`);
      pageRules.push(`@page ${report} { ${pageRule} }`);

      const slot = printRoot?.querySelector(`:scope > .print-slot-${report}`) as HTMLElement | null;
      const reportEl = slot?.querySelector(
        report === "assignments" ? ":scope > .print-assignments" : ":scope > .print-schedule",
      ) as HTMLElement | null;
      if (!printRoot || !slot || !reportEl) return;

      const PX_PER_IN = 96;
      const PX_PER_MM = PX_PER_IN / 25.4;
      const pageWidthIn = orientation === "landscape" ? 11 : 8.5;
      const pageHeightIn = orientation === "landscape" ? 8.5 : 11;
      const marginPx = marginMm * PX_PER_MM;
      // Chrome's own print header/footer (date/title above, URL/page
      // number below - on by default in the print dialog) eats into the
      // page beyond our @page margin, and the page has no way to detect
      // or disable it. Budget extra room for it, plus a small fudge
      // factor for rounding, so the fit has a real safety margin instead
      // of landing right on the edge and spilling a sliver onto page 2.
      const HEADER_FOOTER_BUFFER_PX = 0.75 * PX_PER_IN;
      const FIT_SAFETY_FACTOR = 0.98;
      const pageContentWidthPx = pageWidthIn * PX_PER_IN - marginPx * 2;
      const pageContentHeightPx = pageHeightIn * PX_PER_IN - marginPx * 2 - HEADER_FOOTER_BUFFER_PX;

      // A fixed Print size is applied with zoom, which (unlike transform:
      // scale) changes the layout size - so an oversized report runs onto
      // more pages instead of being cut off. Widening by 1/zoom keeps it
      // spanning the full page width.
      const fixed = design.printScaleMode === "fixed";
      const zoom = fixed ? Math.min(200, Math.max(25, Number(design.printScalePercent) || 100)) / 100 : 1;
      if (zoom !== 1) reportEl.style.zoom = String(zoom);
      reportEl.style.width = `${pageContentWidthPx / zoom}px`;

      // Then shrink the report (never enlarge) to fit one page, the way
      // Excel's "fit sheet on one page" works: always in "fit" mode, and
      // always for the Line Assignments free-form layout - a page-shaped
      // canvas that also sits below the title, so a fixed size there only
      // changes how big the text inside the boxes is, never how many
      // sheets it takes.
      const freeForm = report === "assignments" && printSettings.freeFormLayout;
      if (!fixed || freeForm) {
        printRoot.classList.add("measuring");
        const naturalHeight = reportEl.getBoundingClientRect().height;
        printRoot.classList.remove("measuring");

        const scale = Math.min(1, (pageContentHeightPx / naturalHeight) * FIT_SAFETY_FACTOR);
        if (scale < 1) {
          // Shift right by half the width it lost, so it's centered on the
          // page. Transform lengths are in the element's zoomed units.
          const offsetPx = ((1 - scale) * pageContentWidthPx) / 2 / zoom;
          reportEl.style.transformOrigin = "top left";
          reportEl.style.transform = `translateX(${offsetPx}px) scale(${scale})`;
          // A transform doesn't shrink the space the report takes up, so
          // clip its slot to the shrunk height - otherwise the unscaled
          // height spills a blank page.
          slot.style.height = `${naturalHeight * scale}px`;
          slot.style.overflow = "hidden";
        }
      }

      cleanups.push(() => {
        reportEl.style.transform = "";
        reportEl.style.transformOrigin = "";
        reportEl.style.zoom = "";
        reportEl.style.width = "";
        slot.style.height = "";
        slot.style.overflow = "";
      });
    });

    let pageStyle = document.getElementById("dynamic-page-style") as HTMLStyleElement | null;
    if (!pageStyle) {
      pageStyle = document.createElement("style");
      pageStyle.id = "dynamic-page-style";
      document.head.appendChild(pageStyle);
    }
    pageStyle.textContent = `@media print { ${pageRules.join(" ")} }`;

    const id = requestAnimationFrame(() => window.print());
    const reset = () => setPrintTarget(null);
    window.addEventListener("afterprint", reset);
    return () => {
      cancelAnimationFrame(id);
      for (const report of reports) document.body.classList.remove(`printing-${report}`);
      window.removeEventListener("afterprint", reset);
      for (const cleanup of cleanups) cleanup();
      printRoot?.classList.remove("measuring");
    };
    // Only re-run for a new print request - the settings are read when
    // printing starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printTarget]);

  function setBoards(updater: DailyBoard[] | ((boards: DailyBoard[]) => DailyBoard[])) {
    setData((d) => ({ ...d, boards: typeof updater === "function" ? updater(d.boards) : updater }));
  }
  function setWorkOrders(updater: (wos: WorkOrder[]) => WorkOrder[]) {
    setData((d) => ({ ...d, workOrders: updater(d.workOrders) }));
  }
  function setEmployees(updater: (emps: Employee[]) => Employee[]) {
    setData((d) => ({ ...d, employees: updater(d.employees) }));
  }
  function setSchedulePrintSettings(updater: (s: SchedulePrintSettings) => SchedulePrintSettings) {
    setData((d) => ({ ...d, schedulePrintSettings: updater(d.schedulePrintSettings) }));
  }
  function setTimeOff(updater: (entries: TimeOffEntry[]) => TimeOffEntry[]) {
    setData((d) => ({ ...d, timeOff: updater(d.timeOff) }));
  }
  function setPrintSettings(updater: (s: PrintAssignSettings) => PrintAssignSettings) {
    setData((d) => ({ ...d, printSettings: updater(d.printSettings) }));
  }
  function setScheduledLines(updater: (lines: string[]) => string[]) {
    setData((d) => ({ ...d, scheduledLines: updater(d.scheduledLines) }));
  }
  function setScheduleColumnWidths(updater: (widths: Record<string, number>) => Record<string, number>) {
    setData((d) => ({ ...d, printScheduleColumnWidths: updater(d.printScheduleColumnWidths) }));
  }
  function setScheduleHiddenColumns(updater: (cols: string[]) => string[]) {
    setData((d) => ({ ...d, printScheduleHiddenColumns: updater(d.printScheduleHiddenColumns) }));
  }
  function setScheduleColumnOrder(order: string[]) {
    setData((d) => ({ ...d, printScheduleColumnOrder: order }));
  }

  async function handleJsonImport(file: File) {
    try {
      const imported = await readAppDataFromJsonFile(file);
      if (!confirm(`This will replace this shift's (${shift ? SHIFT_LABELS[shift] : ""}) data with the imported backup. Continue?`))
        return;
      setData(imported);
    } catch (err) {
      alert(`Could not read that file: ${(err as Error).message}`);
    }
  }

  async function handleExcelImport(file: File) {
    try {
      setPendingImport({ fileName: file.name, sheets: await readWorkbookSheets(file) });
    } catch (err) {
      alert(`Could not read that spreadsheet: ${(err as Error).message}`);
    }
  }

  function finishExcelImport(workOrders: WorkOrder[], importColumnMap: Record<string, string>) {
    // One change, so a single Undo puts the old schedule back.
    setData((d) => ({ ...d, workOrders, importColumnMap }));
    setPendingImport(null);
    setTab("schedule");
  }

  function confirmErase() {
    if (eraseAction === "reset" && shift) setData(seedDataForShift(shift));
    if (eraseAction === "wipe") setData(emptyAppData());
    setEraseAction(null);
  }

  if (shiftAuth.status === "loading") {
    return (
      <div className="shift-chooser">
        <div className="shift-chooser-card">
          <Brand markSize={56} />
          <p className="shift-chooser-hint">Loading…</p>
        </div>
      </div>
    );
  }

  if (!shift) {
    return <UnlockScreen lastShift={lastShift} onUnlocked={rememberShift} />;
  }

  // When a remembered computer locks again (0 if it isn't remembered).
  const until = rememberedUntil();
  const remembered = until > Date.now() ? until : 0;

  return (
    <div className="app">
      <header className="app-header">
        <Brand markSize={34} />
        <nav className="tabs">
          <button className={`tab-btn ${tab === "schedule" ? "active" : ""}`} onClick={() => setTab("schedule")}>
            Production Schedule
          </button>
          <button className={`tab-btn ${tab === "assignments" ? "active" : ""}`} onClick={() => setTab("assignments")}>
            Line Assignments
          </button>
          <button className={`tab-btn ${tab === "roster" ? "active" : ""}`} onClick={() => setTab("roster")}>
            Skills &amp; Roles
          </button>
          <button className={`tab-btn ${tab === "timeoff" ? "active" : ""}`} onClick={() => setTab("timeoff")}>
            Time Off
          </button>
        </nav>
        <div className="shift-picker">
          <span
            className="shift-current"
            title={
              remembered
                ? `This computer stays unlocked for ${SHIFT_LABELS[shift]} until ${rememberedUntilLabel(remembered)}, even if the app is closed`
                : "This computer is unlocked for this shift until the app is closed"
            }
          >
            {SHIFT_LABELS[shift]}
            {remembered > 0 && <small>Remembered until {rememberedUntilLabel(remembered)}</small>}
          </span>
          <button
            className="btn lock-btn"
            onClick={() => lock()}
            disabled={locking}
            title="Lock the app - the next person needs a shift password. Lock, then unlock with another shift's password to switch shifts."
          >
            {locking ? "Locking…" : "🔒 Lock"}
          </button>
        </div>
        <div className="toolbar toolbar-dark">
          <button className="btn" onClick={history.undo} disabled={!history.canUndo} title="Undo your last change (Ctrl+Z)">
            ↶ Undo
          </button>
          <button className="btn" onClick={history.redo} disabled={!history.canRedo} title="Redo (Ctrl+Y)">
            ↷ Redo
          </button>
          <PrintMenu choice={printChoice} onPrint={print} boardDate={selectedBoard?.date} today={today} />
          {tab === "schedule" && (
            <>
              <button
                className="btn"
                onClick={() =>
                  exportWorkOrdersToExcel(workOrders).catch((err) =>
                    alert(`Could not export: ${(err as Error).message}`),
                  )
                }
              >
                ⬇ Export Excel
              </button>
              <button className="btn" onClick={() => excelInputRef.current?.click()}>
                ⬆ Import Excel
              </button>
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xlsm,.xls"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Cleared so picking the same file again still triggers an import.
                  e.target.value = "";
                  if (file) handleExcelImport(file);
                }}
              />
            </>
          )}
          <button className="btn" onClick={() => exportAppDataToJson(data)}>
            ⬇ Backup (JSON)
          </button>
          <button className="btn" onClick={() => jsonInputRef.current?.click()}>
            ⬆ Restore Backup
          </button>
          <input
            ref={jsonInputRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && handleJsonImport(e.target.files[0])}
          />
          <button className="btn" onClick={() => setEraseAction("reset")}>
            Reset to sample data
          </button>
          <button className="btn danger" onClick={() => setEraseAction("wipe")}>
            Wipe all data
          </button>
        </div>
      </header>

      {sync.problem && (
        <div className="sync-banner" role="alert">
          ⚠ Changes aren't reaching the cloud: {sync.problem}. They're saved on this computer for now.
        </div>
      )}

      <main className="app-main">
        {tab === "schedule" && (
          <ProductionSchedule
            workOrders={workOrders}
            setWorkOrders={setWorkOrders}
            scheduledLines={scheduledLines}
            setScheduledLines={setScheduledLines}
            columnWidths={printScheduleColumnWidths}
            setColumnWidths={setScheduleColumnWidths}
            hiddenColumns={printScheduleHiddenColumns}
            setHiddenColumns={setScheduleHiddenColumns}
            columnOrder={printScheduleColumnOrder}
            setColumnOrder={setScheduleColumnOrder}
            design={schedulePrintSettings}
            setDesign={setSchedulePrintSettings}
            changeoverTimes={changeoverTimes}
            changeoverClock={changeoverClock}
            setChangeoverClock={(clock) => setData((d) => ({ ...d, changeoverClock: clock }))}
          />
        )}
        {tab === "assignments" && (
          <LineAssignments
            boards={boards}
            setBoards={setBoards}
            selectedId={selectedBoard?.id ?? ""}
            setSelectedId={setSelectedBoardId}
            employees={employees}
            defaultShiftLabel={SHIFT_LABELS[shift]}
            printSettings={printSettings}
            setPrintSettings={setPrintSettings}
            timeOff={timeOff}
          />
        )}
        {tab === "roster" && <SkillsRoles employees={employees} setEmployees={setEmployees} />}
        {tab === "timeoff" && <TimeOff timeOff={timeOff} setTimeOff={setTimeOff} employees={employees} />}
      </main>

      {pendingImport && (
        <ImportColumnsDialog
          fileName={pendingImport.fileName}
          sheets={pendingImport.sheets}
          learned={importColumnMap}
          onCancel={() => setPendingImport(null)}
          onImport={finishExcelImport}
        />
      )}

      {idle.kind !== "active" && (
        <div className="modal-backdrop idle-backdrop">
          <div
            className="modal idle-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="idle-title"
            aria-describedby="idle-text"
          >
            {idle.kind === "warning" ? (
              <>
                <h2 id="idle-title">Still there?</h2>
                <p id="idle-text">
                  To keep {SHIFT_LABELS[shift]}'s data safe, LineUp locks after {IDLE_LOCK_MINUTES} minutes without
                  a click or key press. Locking in <strong>{idle.secondsLeft}</strong> second
                  {idle.secondsLeft === 1 ? "" : "s"}.
                </p>
                <div className="modal-actions">
                  <button className="btn" onClick={() => lock()} disabled={locking}>
                    🔒 Lock now
                  </button>
                  <button className="btn primary" onClick={stayUnlocked}>
                    Stay unlocked
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="idle-title">Couldn't lock yet</h2>
                <p id="idle-text">
                  Nobody has used LineUp for {IDLE_LOCK_MINUTES} minutes, but the last change hasn't reached the cloud
                  (no connection?). So it stays unlocked and doesn't lose that change. It tries again every minute.
                </p>
                <div className="modal-actions">
                  <button className="btn primary" onClick={stayUnlocked}>
                    OK
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {eraseAction && (
        <TypeToConfirmDialog
          title={eraseAction === "wipe" ? `Wipe all of ${SHIFT_LABELS[shift]}'s data?` : `Reset ${SHIFT_LABELS[shift]} to sample data?`}
          actionLabel={eraseAction === "wipe" ? "Wipe all data" : "Reset to sample data"}
          onConfirm={confirmErase}
          onCancel={() => setEraseAction(null)}
        >
          <p>
            {eraseAction === "wipe" ? "This erases" : "This replaces"} everything in <strong>{SHIFT_LABELS[shift]}</strong>
            : the Production Schedule, Line Assignments, Skills &amp; Roles and Time Off
            {eraseAction === "reset" && ", with the original sample data"}. The other shifts aren't affected.
          </p>
          <p>Undo (top left) can only bring it back until the page is refreshed.</p>
        </TypeToConfirmDialog>
      )}

      <footer className="toolbar-footer">
        Synced live to the cloud - this device's {SHIFT_LABELS[shift]} Production Schedule, Line Assignments boards,
        Skills &amp; Roles roster and Time Off schedule are kept completely separate from the other shifts. Use "Backup (JSON)"
        regularly to keep a copy you can restore from any device.
      </footer>

      {/* Line Assignments first: "Print both" prints the board, then the schedule. */}
      <div className="print-root">
        <div className="print-slot print-slot-assignments">
          <PrintAssignments board={selectedBoard} employees={employees} settings={printSettings} />
        </div>
        <div className="print-slot print-slot-schedule">
          <PrintSchedule
            workOrders={workOrders}
            scheduledLines={scheduledLines}
            columnWidths={printScheduleColumnWidths}
            hiddenColumns={printScheduleHiddenColumns}
            columnOrder={printScheduleColumnOrder}
            design={schedulePrintSettings}
            changeoverTimes={changeoverTimes}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
