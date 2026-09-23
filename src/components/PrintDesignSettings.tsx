import { useState } from "react";
import type { PrintAssignSettings } from "../types";
import { defaultPrintSettings } from "../seedData";

interface Props {
  settings: PrintAssignSettings;
  setSettings: (updater: (s: PrintAssignSettings) => PrintAssignSettings) => void;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="color-field">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span>{label}</span>
    </label>
  );
}

function clampScale(value: number): number {
  return Math.min(200, Math.max(25, Math.round(Number(value) || 100)));
}

export default function PrintDesignSettings({ settings, setSettings }: Props) {
  const [open, setOpen] = useState(false);

  function set<K extends keyof PrintAssignSettings>(key: K, value: PrintAssignSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  return (
    <div className="panel">
      <button className="print-design-toggle" onClick={() => setOpen((o) => !o)}>
        <h2 style={{ margin: 0 }}>🎨 Customize Print Design</h2>
        <span>{open ? "▲ Hide" : "▼ Show"}</span>
      </button>

      {open && (
        <div className="print-design-body">
          <div className="print-design-row">
            <label className="print-design-field">
              Orientation
              <select
                value={settings.orientation}
                onChange={(e) => set("orientation", e.target.value as PrintAssignSettings["orientation"])}
              >
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </label>

            <label className="print-design-checkbox">
              <input
                type="checkbox"
                checked={settings.includeRoomSections}
                onChange={(e) => set("includeRoomSections", e.target.checked)}
              />
              Include Room &amp; Duty Assignments band
            </label>

            <label className="print-design-checkbox">
              <input
                type="checkbox"
                checked={settings.highlightRoles}
                onChange={(e) => set("highlightRoles", e.target.checked)}
              />
              Highlight Line Leaders / MLL / MLT by name
            </label>

            <label className="print-design-checkbox">
              <input
                type="checkbox"
                checked={settings.freeFormLayout}
                onChange={(e) => set("freeFormLayout", e.target.checked)}
              />
              Use custom box positions (drag &amp; resize boxes on the page above)
            </label>
          </div>

          <div className="print-design-row">
            <label className="print-design-field">
              Print size
              <select
                value={settings.printScaleMode}
                onChange={(e) => set("printScaleMode", e.target.value as PrintAssignSettings["printScaleMode"])}
              >
                <option value="fit">Fit to one page</option>
                <option value="fixed">Fixed size</option>
              </select>
            </label>
            {settings.printScaleMode === "fixed" && (
              <>
                <label className="print-design-field print-scale-field">
                  Size (%)
                  <input
                    type="number"
                    min={25}
                    max={200}
                    step={5}
                    value={settings.printScalePercent}
                    onChange={(e) => set("printScalePercent", Number(e.target.value))}
                    onBlur={() => set("printScalePercent", clampScale(settings.printScalePercent))}
                  />
                </label>
                <input
                  type="range"
                  className="print-scale-slider"
                  min={25}
                  max={200}
                  step={5}
                  value={clampScale(settings.printScalePercent)}
                  onChange={(e) => set("printScalePercent", Number(e.target.value))}
                  aria-label="Print size percent"
                />
              </>
            )}
            <span className="print-scale-hint">
              {settings.printScaleMode === "fit"
                ? "Prints at full size, shrinking only when needed to fit on one page."
                : settings.freeFormLayout
                  ? "With custom box positions this sets the text size inside the boxes; the page still prints on one sheet. Make a box bigger if its names get cut off."
                  : "Always prints at this size. Below 100% fits more per page; above 100% is easier to read but may run onto a second page."}
            </span>
          </div>

          <div className="print-design-row">
            <label className="print-design-checkbox">
              <input type="checkbox" checked={settings.showBanner} onChange={(e) => set("showBanner", e.target.checked)} />
              Show safety banner
            </label>
            <label className="print-design-field" style={{ flex: 1 }}>
              Banner text
              <input
                type="text"
                value={settings.bannerText}
                disabled={!settings.showBanner}
                onChange={(e) => set("bannerText", e.target.value)}
              />
            </label>
          </div>

          <div className="print-design-colors">
            <ColorField label="Title bar" value={settings.titleColor} onChange={(v) => set("titleColor", v)} />
            <ColorField label="Banner background" value={settings.bannerColor} onChange={(v) => set("bannerColor", v)} />
            <ColorField label="Banner text" value={settings.bannerTextColor} onChange={(v) => set("bannerTextColor", v)} />
            <ColorField label="Scheduled" value={settings.scheduledColor} onChange={(v) => set("scheduledColor", v)} />
            <ColorField label="Not Scheduled" value={settings.notScheduledColor} onChange={(v) => set("notScheduledColor", v)} />
            <ColorField label="PM" value={settings.pmColor} onChange={(v) => set("pmColor", v)} />
            <ColorField label="Line Leader highlight" value={settings.leaderColor} onChange={(v) => set("leaderColor", v)} />
            <ColorField label="MLL highlight" value={settings.mllColor} onChange={(v) => set("mllColor", v)} />
            <ColorField label="MLT highlight" value={settings.mltColor} onChange={(v) => set("mltColor", v)} />
          </div>

          <button className="btn small" onClick={() => setSettings(() => ({ ...defaultPrintSettings }))}>
            Reset to defaults
          </button>
        </div>
      )}
    </div>
  );
}
