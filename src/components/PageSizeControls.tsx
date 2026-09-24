export interface PageSizeValues {
  printScaleMode: "fit" | "fixed";
  printScalePercent: number;
  printMarginMm: number;
}

const MARGIN_OPTIONS = [
  { mm: 0, label: "None" },
  { mm: 5, label: "Narrow (5 mm)" },
  { mm: 10, label: "Normal (10 mm)" },
  { mm: 15, label: "Wide (15 mm)" },
  { mm: 20, label: "Extra wide (20 mm)" },
];

function clampScale(value: number): number {
  return Math.min(200, Math.max(25, Math.round(Number(value) || 100)));
}

// Print size (fit to one page / fixed %) and margins - shared by both
// reports' Customize Print Design panels.
export default function PageSizeControls({
  values,
  onChange,
  hint,
}: {
  values: PageSizeValues;
  onChange: (patch: Partial<PageSizeValues>) => void;
  hint: string;
}) {
  return (
    <>
      <label className="print-design-field">
        Print size
        <select
          value={values.printScaleMode}
          onChange={(e) => onChange({ printScaleMode: e.target.value as PageSizeValues["printScaleMode"] })}
        >
          <option value="fit">Fit to one page</option>
          <option value="fixed">Fixed size</option>
        </select>
      </label>
      {values.printScaleMode === "fixed" && (
        <>
          <label className="print-design-field print-scale-field">
            Size (%)
            <input
              type="number"
              min={25}
              max={200}
              step={5}
              value={values.printScalePercent}
              onChange={(e) => onChange({ printScalePercent: Number(e.target.value) })}
              onBlur={() => onChange({ printScalePercent: clampScale(values.printScalePercent) })}
            />
          </label>
          <input
            type="range"
            className="print-scale-slider"
            min={25}
            max={200}
            step={5}
            value={clampScale(values.printScalePercent)}
            onChange={(e) => onChange({ printScalePercent: Number(e.target.value) })}
            aria-label="Print size percent"
          />
        </>
      )}
      <label className="print-design-field">
        Margins
        <select value={values.printMarginMm} onChange={(e) => onChange({ printMarginMm: Number(e.target.value) })}>
          {MARGIN_OPTIONS.some((o) => o.mm === values.printMarginMm) ? null : (
            <option value={values.printMarginMm}>{values.printMarginMm} mm</option>
          )}
          {MARGIN_OPTIONS.map((o) => (
            <option key={o.mm} value={o.mm}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <span className="print-scale-hint">{hint}</span>
    </>
  );
}
