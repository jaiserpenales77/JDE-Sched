import { useEffect, useRef, useState } from "react";
import "./App.css";
import { useShiftData, useCurrentShift, seedDataForShift, emptyAppData } from "./storage";
import ProductionSchedule from "./components/ProductionSchedule";
import LineAssignments from "./components/LineAssignments";
import SkillsRoles from "./components/SkillsRoles";
import { PrintSchedule, PrintAssignments } from "./components/PrintViews";
import {
  exportAppDataToJson,
  exportWorkOrdersToExcel,
  readAppDataFromJsonFile,
  readWorkOrdersFromWorkbookFile,
} from "./excel";
import PrintDesignSettings from "./components/PrintDesignSettings";
import type { WorkOrder, Employee, PrintAssignSettings, DailyBoard, ShiftKey } from "./types";
import { SHIFT_KEYS, SHIFT_LABELS } from "./types";

type Tab = "schedule" | "assignments" | "roster";
type PrintTarget = "schedule" | "assignments" | null;

function App() {
  const [shift, chooseShift] = useCurrentShift();
  const [data, setData] = useShiftData(shift);
  const { workOrders, employees, printSettings, scheduledLines, printScheduleColumnWidths, printScheduleHiddenColumns, boards } =
    data;
  const [tab, setTab] = useState<Tab>("schedule");
  const [selectedBoardId, setSelectedBoardId] = useState<string>("");
  const [printTarget, setPrintTarget] = useState<PrintTarget>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const sortedBoards = [...boards].sort((a, b) => (a.date < b.date ? 1 : -1));
  const selectedBoard = boards.find((b) => b.id === selectedBoardId) ?? sortedBoards[0];

  useEffect(() => {
    if (!printTarget) return;
    document.body.classList.add(`printing-${printTarget}`);

    const orientation = printTarget === "assignments" ? printSettings.orientation : "landscape";
    const marginMm =
      printTarget === "assignments" ? Math.min(30, Math.max(0, Number(printSettings.printMarginMm) || 0)) : 10;
    let pageStyle = document.getElementById("dynamic-page-style") as HTMLStyleElement | null;
    if (!pageStyle) {
      pageStyle = document.createElement("style");
      pageStyle.id = "dynamic-page-style";
      document.head.appendChild(pageStyle);
    }
    pageStyle.textContent = `@media print { @page { size: ${orientation}; margin: ${marginMm}mm; } }`;

    const printRoot = document.querySelector(".print-root") as HTMLElement | null;
    const assignEl = document.querySelector(".print-assignments") as HTMLElement | null;

    if (assignEl) {
      assignEl.style.transform = "";
      assignEl.style.zoom = "";
      assignEl.style.width = "";
    }
    if (printRoot) {
      printRoot.style.height = "";
      printRoot.style.overflow = "";
    }

    if (printTarget === "assignments" && printRoot && assignEl) {
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
      // scale) changes the layout size - so in the flowing grid an
      // oversized report runs onto a second page instead of being cut off.
      // Widening by 1/zoom keeps it spanning the full page width.
      const fixed = printSettings.printScaleMode === "fixed";
      const zoom = fixed ? Math.min(200, Math.max(25, Number(printSettings.printScalePercent) || 100)) / 100 : 1;
      if (zoom !== 1) assignEl.style.zoom = String(zoom);
      assignEl.style.width = `${pageContentWidthPx / zoom}px`;

      // Then shrink the report (never enlarge) to fit one page, the way
      // Excel's "fit sheet on one page" works: always in "fit" mode, and
      // always for the free-form layout - a page-shaped canvas that also
      // sits below the title, so a fixed size there only changes how big
      // the text inside the boxes is, never how many sheets it takes.
      if (!fixed || printSettings.freeFormLayout) {
        printRoot.classList.add("measuring");
        const naturalHeight = assignEl.getBoundingClientRect().height;
        printRoot.classList.remove("measuring");

        const scale = Math.min(1, (pageContentHeightPx / naturalHeight) * FIT_SAFETY_FACTOR);
        if (scale < 1) {
          // Shift right by half the width it lost, so it's centered on the
          // page. Transform lengths are in the element's zoomed units.
          const offsetPx = ((1 - scale) * pageContentWidthPx) / 2 / zoom;
          assignEl.style.transformOrigin = "top left";
          assignEl.style.transform = `translateX(${offsetPx}px) scale(${scale})`;
          printRoot.style.height = `${naturalHeight * scale}px`;
          printRoot.style.overflow = "hidden";
        }
      }
    }

    const id = requestAnimationFrame(() => window.print());
    const reset = () => setPrintTarget(null);
    window.addEventListener("afterprint", reset);
    return () => {
      cancelAnimationFrame(id);
      document.body.classList.remove(`printing-${printTarget}`);
      window.removeEventListener("afterprint", reset);
      if (assignEl) {
        assignEl.style.transform = "";
        assignEl.style.zoom = "";
        assignEl.style.width = "";
      }
      if (printRoot) {
        printRoot.style.height = "";
        printRoot.style.overflow = "";
        printRoot.classList.remove("measuring");
      }
    };
  }, [
    printTarget,
    printSettings.orientation,
    printSettings.freeFormLayout,
    printSettings.printScaleMode,
    printSettings.printScalePercent,
    printSettings.printMarginMm,
  ]);

  function setBoards(updater: DailyBoard[] | ((boards: DailyBoard[]) => DailyBoard[])) {
    setData((d) => ({ ...d, boards: typeof updater === "function" ? updater(d.boards) : updater }));
  }
  function setWorkOrders(updater: (wos: WorkOrder[]) => WorkOrder[]) {
    setData((d) => ({ ...d, workOrders: updater(d.workOrders) }));
  }
  function setEmployees(updater: (emps: Employee[]) => Employee[]) {
    setData((d) => ({ ...d, employees: updater(d.employees) }));
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
      const workOrders = await readWorkOrdersFromWorkbookFile(file);
      if (!confirm(`Found ${workOrders.length} work order row(s). Replace the current Production Schedule?`)) return;
      setData((d) => ({ ...d, workOrders }));
      setTab("schedule");
    } catch (err) {
      alert(`Could not read that spreadsheet: ${(err as Error).message}`);
    }
  }

  function handleResetToSample() {
    if (
      !confirm(
        `Replace this shift's (${shift ? SHIFT_LABELS[shift] : ""}) Production Schedule, roster and boards with the original sample data from the spreadsheet?`,
      )
    )
      return;
    if (shift) setData(seedDataForShift(shift));
  }

  function handleWipe() {
    if (!confirm(`This will erase all of this shift's (${shift ? SHIFT_LABELS[shift] : ""}) data. Continue?`)) return;
    setData(emptyAppData());
  }

  if (!shift) {
    return (
      <div className="shift-chooser">
        <div className="shift-chooser-card">
          <div className="app-title">
            JDE Sched
            <small>Production Line Schedule &amp; Crew Board</small>
          </div>
          <h1>Which shift is this device showing?</h1>
          <div className="shift-chooser-options">
            {SHIFT_KEYS.map((key) => (
              <button key={key} className="btn primary" onClick={() => chooseShift(key)}>
                {SHIFT_LABELS[key]}
              </button>
            ))}
          </div>
          <p className="shift-chooser-hint">
            You can change this anytime from the header. Each shift has its own completely separate Production
            Schedule, Line Assignments boards and Skills &amp; Roles roster - nothing here is shared between shifts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          JDE Sched
          <small>Production Line Schedule &amp; Crew Board</small>
        </div>
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
        </nav>
        <label className="shift-picker">
          Shift
          <select value={shift} onChange={(e) => chooseShift(e.target.value as ShiftKey)}>
            {SHIFT_KEYS.map((key) => (
              <option key={key} value={key}>
                {SHIFT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        <div className="toolbar toolbar-dark">
          {tab === "schedule" && (
            <>
              <button className="btn" onClick={() => setPrintTarget("schedule")}>
                🖨 Print Report
              </button>
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
                onChange={(e) => e.target.files?.[0] && handleExcelImport(e.target.files[0])}
              />
            </>
          )}
          {tab === "assignments" && (
            <button className="btn" onClick={() => setPrintTarget("assignments")} disabled={!selectedBoard}>
              🖨 Print Report
            </button>
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
          <button className="btn" onClick={handleResetToSample}>
            Reset to sample data
          </button>
          <button className="btn danger" onClick={handleWipe}>
            Wipe all data
          </button>
        </div>
      </header>

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
          />
        )}
        {tab === "assignments" && (
          <>
            <LineAssignments
              boards={boards}
              setBoards={setBoards}
              selectedId={selectedBoard?.id ?? ""}
              setSelectedId={setSelectedBoardId}
              employees={employees}
              defaultShiftLabel={SHIFT_LABELS[shift]}
              printSettings={printSettings}
              setPrintSettings={setPrintSettings}
            />
            <PrintDesignSettings settings={printSettings} setSettings={setPrintSettings} />
          </>
        )}
        {tab === "roster" && <SkillsRoles employees={employees} setEmployees={setEmployees} />}
      </main>

      <footer className="toolbar-footer">
        Synced live to the cloud - this device's {SHIFT_LABELS[shift]} Production Schedule, Line Assignments boards
        and Skills &amp; Roles roster are kept completely separate from the other shifts. Use "Backup (JSON)"
        regularly to keep a copy you can restore from any device.
      </footer>

      <div className="print-root">
        <PrintSchedule
          workOrders={workOrders}
          scheduledLines={scheduledLines}
          columnWidths={printScheduleColumnWidths}
          hiddenColumns={printScheduleHiddenColumns}
        />
        <PrintAssignments board={selectedBoard} employees={employees} settings={printSettings} />
      </div>
    </div>
  );
}

export default App;
