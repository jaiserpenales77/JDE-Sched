import { useState } from "react";
import type { SchedulePrintSettings } from "../types";
import { defaultSchedulePrintSettings } from "../seedData";
import PageSizeControls from "./PageSizeControls";
import { ColorField } from "./PrintDesignSettings";

interface Props {
  settings: SchedulePrintSettings;
  setSettings: (updater: (s: SchedulePrintSettings) => SchedulePrintSettings) => void;
}

const SIZE_FIELDS: { key: "titleFontSize" | "headerFontSize" | "textFontSize"; label: string }[] = [
  { key: "titleFontSize", label: "Title size (pt)" },
  { key: "headerFontSize", label: "Column header size (pt)" },
  { key: "textFontSize", label: "Table text size (pt)" },
];

export default function SchedulePrintDesign({ settings, setSettings }: Props) {
  const [open, setOpen] = useState(false);

  function set<K extends keyof SchedulePrintSettings>(key: K, value: SchedulePrintSettings[K]) {
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
                onChange={(e) => set("orientation", e.target.value as SchedulePrintSettings["orientation"])}
              >
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </label>
            <PageSizeControls
              values={settings}
              onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
              hint={
                settings.printScaleMode === "fit"
                  ? "Shrinks the whole schedule onto one page when it's too long."
                  : "Prints at this size and runs onto more pages if needed. 100% is the normal size."
              }
            />
          </div>

          <div className="print-design-row">
            <label className="print-design-field" style={{ flex: 1 }}>
              Title
              <input type="text" value={settings.title} onChange={(e) => set("title", e.target.value)} />
            </label>
            <label className="print-design-checkbox">
              <input type="checkbox" checked={settings.showDate} onChange={(e) => set("showDate", e.target.checked)} />
              Show today's date under the title
            </label>
          </div>

          <div className="print-design-row">
            {SIZE_FIELDS.map(({ key, label }) => (
              <label className="print-design-field print-scale-field" key={key}>
                {label}
                <input
                  type="number"
                  min={4}
                  max={36}
                  step={0.5}
                  value={settings[key]}
                  onChange={(e) => set(key, Number(e.target.value))}
                  onBlur={() => set(key, Math.min(36, Math.max(4, Number(settings[key]) || defaultSchedulePrintSettings[key])))}
                />
              </label>
            ))}
          </div>

          <div className="print-design-colors">
            <ColorField label="Column headers" value={settings.headerFillColor} onChange={(v) => set("headerFillColor", v)} />
            <ColorField label="Calculated columns" value={settings.formulaColColor} onChange={(v) => set("formulaColColor", v)} />
            <ColorField label="Allergen rows" value={settings.allergenColor} onChange={(v) => set("allergenColor", v)} />
            <ColorField label="Oily product rows" value={settings.oilColor} onChange={(v) => set("oilColor", v)} />
            <ColorField label="Bulk item rows" value={settings.bulkColor} onChange={(v) => set("bulkColor", v)} />
            <ColorField label="Ready line" value={settings.readyColor} onChange={(v) => set("readyColor", v)} />
            <ColorField label="PM line" value={settings.pmColor} onChange={(v) => set("pmColor", v)} />
            <ColorField label="Trial line" value={settings.trialColor} onChange={(v) => set("trialColor", v)} />
            <ColorField label="Line divider" value={settings.dividerColor} onChange={(v) => set("dividerColor", v)} />
            <ColorField
              label="Scheduled line border"
              value={settings.scheduledBorderColor}
              onChange={(v) => set("scheduledBorderColor", v)}
            />
            <ColorField
              label="Changed count text"
              value={settings.countChangedColor}
              onChange={(v) => set("countChangedColor", v)}
            />
          </div>

          <button className="btn small" onClick={() => setSettings(() => ({ ...defaultSchedulePrintSettings }))}>
            Reset to defaults
          </button>
        </div>
      )}
    </div>
  );
}
