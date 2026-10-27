import { useState } from "react";
import type { CrewStyle, PrintAssignSettings } from "../types";
import { defaultPrintSettings } from "../seedData";
import PageSizeControls from "./PageSizeControls";

interface Props {
  settings: PrintAssignSettings;
  setSettings: (updater: (s: PrintAssignSettings) => PrintAssignSettings) => void;
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="color-field">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span>{label}</span>
    </label>
  );
}

// The designs for a line's crew count and ZBS, with a tiny drawing of each.
const CREW_DESIGNS: { style: CrewStyle; name: string; note: string }[] = [
  {
    style: "badge",
    name: "Badge",
    note: "👥 count in the name bar (overtime included), training and dumping as a +1 half (gold, blue). ZBS row below.",
  },
  { style: "bubble", name: "Badge + bubble", note: "The same badge, with training and dumping as +1 bubbles on its corner." },
  { style: "tally", name: "ZBS blocks", note: "No badge. The ZBS row shows a block per spot: white filled, outlined open, red extra." },
  { style: "badgeOnly", name: "Badge only", note: "The badge, with no ZBS row: one more row for names." },
];

function CrewThumb({ style }: { style: CrewStyle }) {
  const badge = style !== "tally" && (
    <span className="ct-badge">
      {style === "badge" || style === "badgeOnly" ? <span className="ct-gold" /> : null}
      {style === "bubble" && <span className="ct-dot" />}
    </span>
  );
  return (
    <span className={`crew-thumb crew-thumb-${style}`} aria-hidden="true">
      <span className="ct-bar">{badge}</span>
      <span className="ct-status" />
      {style !== "badgeOnly" && (
        <span className="ct-note">
          {style === "tally" && (
            <>
              <i />
              <i />
              <i />
              <i className="ct-open" />
            </>
          )}
        </span>
      )}
      <span className="ct-row" />
      <span className="ct-row" />
      {style === "badgeOnly" && <span className="ct-row" />}
    </span>
  );
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
                checked={settings.showCrewCount}
                onChange={(e) => set("showCrewCount", e.target.checked)}
              />
              Show the 👥 crew counts on lines (people / ZBS) and on duty boxes that have one
            </label>

            <div>
              <div className="print-design-subhead">Crew count design (on the page above and the printout)</div>
              <div className="design-choices" role="radiogroup" aria-label="Crew count design">
                {CREW_DESIGNS.map(({ style, name, note }) => (
                  <label className={`design-choice${settings.crewStyle === style ? " selected" : ""}`} key={style}>
                    <input
                      type="radio"
                      name="crew-design"
                      value={style}
                      checked={settings.crewStyle === style}
                      onChange={() => set("crewStyle", style)}
                    />
                    <CrewThumb style={style} />
                    <span className="design-choice-name">{name}</span>
                    <span className="design-choice-note">{note}</span>
                  </label>
                ))}
              </div>
            </div>

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
            <PageSizeControls
              values={settings}
              onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
              hint={
                settings.printScaleMode === "fit"
                  ? "Prints at full size, shrinking only when needed to fit on one page."
                  : settings.freeFormLayout
                    ? "With custom box positions this sets the text size inside the boxes; the page still prints on one sheet. Make a box bigger if its names get cut off."
                    : "Always prints at this size. Below 100% fits more per page; above 100% is easier to read but may run onto a second page."
              }
            />
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
