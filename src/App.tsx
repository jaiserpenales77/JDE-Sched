import { useEffect, useRef, useState } from "react";
import "./App.css";
import { useAppData, resetToSeed, emptyData } from "./storage";
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
import PrintLayoutEditor from "./components/PrintLayoutEditor";
import type { WorkOrder, DailyBoard, Employee, PrintAssignSettings } from "./types";

type Tab = "schedule" | "assignments" | "roster";
type PrintTarget = "schedule" | "assignments" | null;

function App() {
  const [data, setData] = useAppData();
  const [tab, setTab] = useState<Tab>("schedule");
  const [selectedBoardId, setSelectedBoardId] = useState<string>("");
  const [printTarget, setPrintTarget] = useState<PrintTarget>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const sortedBoards = [...data.boards].sort((a, b) => (a.date < b.date ? 1 : -1));
  const selectedBoard = data.boards.find((b) => b.id === selectedBoardId) ?? sortedBoards[0];

  useEffect(() => {
    if (!printTarget) return;
    document.body.classList.add(`printing-${printTarget}`);

    const orientation = printTarget === "assignments" ? data.printSettings.orientation : "landscape";
    let pageStyle = document.getElementById("dynamic-page-style") as HTMLStyleElement | null;
    if (!pageStyle) {
      pageStyle = document.createElement("style");
      pageStyle.id = "dynamic-page-style";
      document.head.appendChild(pageStyle);
    }
    pageStyle.textContent = `@media print { @page { size: ${orientation}; margin: 10mm; } }`;

    const id = requestAnimationFrame(() => window.print());
    const reset = () => setPrintTarget(null);
    window.addEventListener("afterprint", reset);
    return () => {
      cancelAnimationFrame(id);
      document.body.classList.remove(`printing-${printTarget}`);
      window.removeEventListener("afterprint", reset);
    };
  }, [printTarget, data.printSettings.orientation]);

  function setWorkOrders(updater: (wos: WorkOrder[]) => WorkOrder[]) {
    setData((d) => ({ ...d, workOrders: updater(d.workOrders) }));
  }
  function setBoards(updater: (boards: DailyBoard[]) => DailyBoard[]) {
    setData((d) => ({ ...d, boards: updater(d.boards) }));
  }
  function setEmployees(updater: (emps: Employee[]) => Employee[]) {
    setData((d) => ({ ...d, employees: updater(d.employees) }));
  }
  function setPrintSettings(updater: (s: PrintAssignSettings) => PrintAssignSettings) {
    setData((d) => ({ ...d, printSettings: updater(d.printSettings) }));
  }

  async function handleJsonImport(file: File) {
    try {
      const imported = await readAppDataFromJsonFile(file);
      if (!confirm("This will replace all current data with the imported backup. Continue?")) return;
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
    if (!confirm("Replace all current data with the original sample data from the spreadsheet?")) return;
    setData(resetToSeed());
  }

  function handleWipe() {
    if (!confirm("This will erase ALL data (schedule, boards, roster). Continue?")) return;
    setData(emptyData());
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
        <div className="toolbar toolbar-dark">
          {tab === "schedule" && (
            <>
              <button className="btn" onClick={() => setPrintTarget("schedule")}>
                🖨 Print Report
              </button>
              <button
                className="btn"
                onClick={() =>
                  exportWorkOrdersToExcel(data.workOrders).catch((err) =>
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
        {tab === "schedule" && <ProductionSchedule workOrders={data.workOrders} setWorkOrders={setWorkOrders} />}
        {tab === "assignments" && (
          <>
            <LineAssignments
              boards={data.boards}
              setBoards={setBoards}
              selectedId={selectedBoard?.id ?? ""}
              setSelectedId={setSelectedBoardId}
            />
            <PrintDesignSettings settings={data.printSettings} setSettings={setPrintSettings} />
            {data.printSettings.freeFormLayout && selectedBoard && (
              <PrintLayoutEditor board={selectedBoard} settings={data.printSettings} setSettings={setPrintSettings} />
            )}
          </>
        )}
        {tab === "roster" && <SkillsRoles employees={data.employees} setEmployees={setEmployees} />}
      </main>

      <footer className="toolbar-footer">
        Data is saved automatically in this browser. Use "Backup (JSON)" regularly to keep a copy you can restore
        from any device.
      </footer>

      <div className="print-root">
        <PrintSchedule workOrders={data.workOrders} />
        <PrintAssignments board={selectedBoard} employees={data.employees} settings={data.printSettings} />
      </div>
    </div>
  );
}

export default App;
