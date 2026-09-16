import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { BoxLayout, DailyBoard, PrintAssignSettings } from "../types";
import { clamp, lineBoxKey, resolveBoxLayout, roomBoxKey } from "../printLayout";

interface Props {
  board: DailyBoard;
  settings: PrintAssignSettings;
  setSettings: (updater: (s: PrintAssignSettings) => PrintAssignSettings) => void;
}

interface BoxDef {
  key: string;
  title: string;
  subtitle: string;
}

const MIN_SIZE = 5;

type DragMode = "move" | "resize";

interface DragState {
  key: string;
  mode: DragMode;
  startX: number;
  startY: number;
  startRect: BoxLayout;
}

export default function PrintLayoutEditor({ board, settings, setSettings }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const boxes: BoxDef[] = [
    ...board.lineSlots.map((s) => ({ key: lineBoxKey(s.line), title: s.line || "(unnamed line)", subtitle: s.status || "—" })),
    ...(settings.includeRoomSections
      ? board.roomSections.map((s) => ({
          key: roomBoxKey(s.title),
          title: s.title || "(unnamed section)",
          subtitle: `${s.items.length} name${s.items.length === 1 ? "" : "s"}`,
        }))
      : []),
  ];

  function updateLayout(key: string, rect: BoxLayout) {
    setSettings((s) => ({ ...s, boxLayouts: { ...s.boxLayouts, [key]: rect } }));
  }

  function beginDrag(e: ReactPointerEvent, key: string, index: number, mode: DragMode) {
    e.preventDefault();
    if (mode === "resize") e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const startRect = resolveBoxLayout(key, index, settings.boxLayouts);
    setDrag({ key, mode, startX: e.clientX, startY: e.clientY, startRect });
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!drag || !canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const dxPct = ((e.clientX - drag.startX) / canvasRect.width) * 100;
    const dyPct = ((e.clientY - drag.startY) / canvasRect.height) * 100;

    const next: BoxLayout =
      drag.mode === "move"
        ? {
            ...drag.startRect,
            x: clamp(drag.startRect.x + dxPct, 0, 100 - drag.startRect.width),
            y: clamp(drag.startRect.y + dyPct, 0, 100 - drag.startRect.height),
          }
        : {
            ...drag.startRect,
            width: clamp(drag.startRect.width + dxPct, MIN_SIZE, 100 - drag.startRect.x),
            height: clamp(drag.startRect.height + dyPct, MIN_SIZE, 100 - drag.startRect.y),
          };

    updateLayout(drag.key, next);
  }

  function onPointerUp() {
    setDrag(null);
  }

  function resetLayout() {
    if (!confirm("Reset all boxes back to the default grid layout?")) return;
    setSettings((s) => ({ ...s, boxLayouts: {} }));
  }

  const aspect = settings.orientation === "landscape" ? "11 / 8.5" : "8.5 / 11";

  return (
    <div className="panel">
      <h2>🖱 Print Layout Editor</h2>
      <p className="panel-hint">
        Drag a box to move it; drag the handle in its bottom-right corner to resize. Roughly matches the printed
        page's proportions. Changes save automatically.
      </p>
      <div
        ref={canvasRef}
        className="layout-canvas"
        style={{ aspectRatio: aspect }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {boxes.length === 0 && <div className="layout-empty">No boxes to arrange yet — add a line or room section first.</div>}
        {boxes.map((box, i) => {
          const rect = resolveBoxLayout(box.key, i, settings.boxLayouts);
          return (
            <div
              key={box.key}
              className="layout-box"
              style={{
                left: `${rect.x}%`,
                top: `${rect.y}%`,
                width: `${rect.width}%`,
                height: `${rect.height}%`,
              }}
              onPointerDown={(e) => beginDrag(e, box.key, i, "move")}
            >
              <div className="layout-box-title">{box.title}</div>
              <div className="layout-box-subtitle">{box.subtitle}</div>
              <div className="layout-box-resize" onPointerDown={(e) => beginDrag(e, box.key, i, "resize")} />
            </div>
          );
        })}
      </div>
      <button className="btn small" style={{ marginTop: 10 }} onClick={resetLayout}>
        Reset layout to grid
      </button>
    </div>
  );
}
