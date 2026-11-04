import { Fragment } from "react";
import type { ReactNode } from "react";
import type { RunStatus } from "../types";
import { isAllergenRow, isBulkHighlightRow, isOilRow } from "../scheduleLogic";
import {
  bottlesToMake,
  capShort,
  CHANGEOVER_LABELS,
  changeoverMinutes,
  clockText,
  leftText,
  progressText,
  whenText,
} from "../scheduleRun";
import type { WashroomRow } from "../scheduleRun";
import { BOX_COLUMNS, STATUS_CLASS } from "../scheduleBoxes";
import type { BoxColumnKey, BoxesView } from "../scheduleBoxes";

// The printed Production Schedule in the JDE Schedule workbook's look: each
// line a box in its status color, with progress, bottles left, crew, the
// estimated times and next shift's status; and the washroom prep list.

const statusClass = (s: RunStatus | "") => (s ? STATUS_CLASS[s] : "none");

const CODE_CLASS: Record<string, string> = { S1: "s1", "S1 Count Change": "count", S3: "s3", S4: "s4" };

export function ScheduleBoxes({
  view,
  title,
  hidden = [],
}: {
  view: BoxesView;
  title: string;
  hidden?: readonly string[];
}) {
  const cols = BOX_COLUMNS.filter((c) => !hidden.includes(c.key));
  const show = (key: BoxColumnKey) => cols.some((c) => c.key === key);
  // Note rows run from the column after WO to EST. TIME.
  const inner = cols.filter((c) => c.key !== "line" && c.key !== "next");
  const { asOf } = view;
  const date = asOf.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const n = view.summary.next;
  return (
    <div className="sb-report">
      <div className="sb-title">
        <h1>
          {title}
          {view.shiftLabel && <span className="sb-title-shift"> · {view.shiftLabel}</span>}
        </h1>
        <div className="sb-legend sb-legend-status">
          <b>STATUS</b>
          {(Object.keys(STATUS_CLASS) as RunStatus[]).map((s) => (
            <span key={s} className={`sb-chip sb-chip-${STATUS_CLASS[s]}`}>
              <i />
              {s === "PM / CLEANING" ? "PM / Cleaning" : s.charAt(0) + s.slice(1).toLowerCase()}
            </span>
          ))}
        </div>
      </div>
      <div className="sb-sub">
        <span className="sb-date">
          {date} · as of {clockText(asOf)}
        </span>
        <span className="sb-legend">
          <b>CHANGEOVER</b>
          {Object.entries(CHANGEOVER_LABELS).map(([code, label]) => (
            <span key={code} className={`sb-co sb-co-${CODE_CLASS[code]}`}>
              ● {label.replace(" · ", " ")}
            </span>
          ))}
          <span>
            <span className="sb-cap-changed">CAP</span> = new cap
          </span>
          <span>INTL = international</span>
        </span>
      </div>
      <div className="sb-summary">
        {view.check ? (
          <span className="sb-check">⚠ {view.check}</span>
        ) : (
          <span>
            {view.summary.text}
            {"  |  "}Changeovers before end of shift ({clockText(view.end)}): {view.summary.minor} minor ·{" "}
            {view.summary.major} major
            {n && (
              <>
                {"  |  "}Next: {n.line} at {clockText(n.at)}
              </>
            )}
          </span>
        )}
        <span className="sb-legend">
          <b>HIGHLIGHT</b>
          <span className="sb-chip sb-hl-allergen">
            <i />
            Allergen
          </span>
          <span className="sb-chip sb-hl-oil">
            <i />
            Oil
          </span>
          <span className="sb-chip sb-hl-bulk">
            <i />
            Dumping
          </span>
        </span>
      </div>
      <table className="sb-table">
        <colgroup>
          {cols.map((c) => (
            <col key={c.key} style={{ width: `${c.width}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} data-col={c.key}>
                {c.key === "next" && view.nextShiftLabel ? `NEXT: ${view.nextShiftLabel.toUpperCase()}` : c.title}
              </th>
            ))}
          </tr>
        </thead>
        {view.lines.length === 0 && (
          <tbody>
            <tr>
              <td colSpan={cols.length} className="sb-empty">
                No work orders scheduled.
              </td>
            </tr>
          </tbody>
        )}
        {view.lines.map((line, li) => {
          const cls = statusClass(line.status);
          const grey = line.status === "NOT SCHEDULED" || line.status === "PM / CLEANING";
          const span = line.rows.reduce((sum, r) => sum + 1 + (r.notes ? 1 : 0) + (r.wo.remarks.trim() ? 1 : 0), 0);
          return (
            <Fragment key={line.line}>
              {li > 0 && (
                <tbody className="sb-gap" aria-hidden="true">
                  <tr>
                    <td colSpan={cols.length} />
                  </tr>
                </tbody>
              )}
              <tbody className={`sb-line sb-st-${cls}${grey ? " sb-grey" : ""}`}>
                {line.rows.map((r, i) => {
                  const wo = r.wo;
                  const hl = isAllergenRow(wo) ? "sb-hl-allergen" : isOilRow(wo) ? "sb-hl-oil" : isBulkHighlightRow(wo) ? "sb-hl-bulk" : "";
                  const left = bottlesToMake(wo);
                  const co = changeoverMinutes(r.code, view.settings);
                  const est = r.estimate.done ? whenText(r.estimate.done, asOf) : r.estimate.missing;
                  const cells: Record<Exclude<BoxColumnKey, "line" | "next">, ReactNode> = {
                    wo: wo.wo,
                    seq: wo.seq,
                    item: wo.item,
                    description: wo.description,
                    count: <span className={r.countChanged ? "sb-count-changed" : ""}>{wo.count}</span>,
                    bulkItem: wo.bulkItem,
                    bottleSize: wo.bottleSize,
                    capDescription: <span className={r.capChanged ? "sb-cap-changed" : ""}>{capShort(wo.capDescription)}</span>,
                    allergen: wo.allergen,
                    desiccant: wo.desiccant,
                    woQuantity: typeof wo.woQuantity === "number" ? wo.woQuantity.toLocaleString("en-US") : wo.woQuantity,
                    progress: r.first ? (
                      <span className={wo.percentComplete ? "sb-progress" : "sb-not-started"}>{progressText(wo)}</span>
                    ) : r.code ? (
                      <span className={`sb-co sb-co-${CODE_CLASS[r.code]}`}>
                        {CHANGEOVER_LABELS[r.code]}
                        {r.intl ? " · INTL" : ""}
                      </span>
                    ) : (
                      "—"
                    ),
                    left: r.first ? (
                      <span className={wo.percentComplete ? "sb-left" : "sb-left sb-not-started"}>{leftText(left)}</span>
                    ) : co !== null ? (
                      <span className={`sb-co sb-co-${CODE_CLASS[r.code]}`}>{co} min</span>
                    ) : (
                      ""
                    ),
                    crew: line.setup.crew ?? "",
                    est: <span className={r.estimate.done ? (r.first ? "sb-est-first" : "") : "sb-est-missing"}>{est}</span>,
                  };
                  const noteRow = (text: string, key: string) => (
                    <tr className="sb-note" key={key}>
                      {inner.map((c, k) =>
                        k === 0 ? (
                          <td key={c.key} className="sb-arrow">
                            ↳
                          </td>
                        ) : k === 1 ? (
                          <td key={c.key} colSpan={inner.length - 1}>
                            {text}
                          </td>
                        ) : null,
                      )}
                    </tr>
                  );
                  return (
                    <Fragment key={wo.id}>
                      <tr className={`sb-row ${hl}${r.first ? " sb-first" : ""}`}>
                        {i === 0 && show("line") && (
                          <td rowSpan={span} className="sb-linecell" data-col="line">
                            <span className="sb-line-name">{line.name}</span>
                            {line.status && <span className="sb-line-status">{line.status}</span>}
                          </td>
                        )}
                        {inner.map((c) => (
                          <td key={c.key} data-col={c.key} className={`sb-c-${c.key}`}>
                            {cells[c.key as keyof typeof cells]}
                          </td>
                        ))}
                        {i === 0 && show("next") && (
                          <td rowSpan={span} className={`sb-nextcell sb-next-${statusClass(line.next)}`} data-col="next">
                            {line.next}
                          </td>
                        )}
                      </tr>
                      {r.notes && noteRow(`Changeover Notes: ${r.notes}`, `${wo.id}-notes`)}
                      {wo.remarks.trim() && noteRow(`Remarks: ${wo.remarks.trim()}`, `${wo.id}-remarks`)}
                    </Fragment>
                  );
                })}
              </tbody>
            </Fragment>
          );
        })}
      </table>
    </div>
  );
}

// "today 4:00 PM", for the washroom list's heading.
const lowerWhen = (d: Date, asOf: Date) => whenText(d, asOf).replace(/^Today/, "today");

export function WashroomList({
  rows,
  asOf,
  end,
  shiftLabel,
}: {
  rows: WashroomRow[];
  asOf: Date;
  end: Date;
  shiftLabel: string;
}) {
  const oily = rows.filter((r) => r.offType === "Oily").length;
  const allergen = rows.filter((r) => r.offAllergen).length;
  const cremer = rows.filter((r) => r.filler === "Cremer").length;
  const merrill = rows.filter((r) => r.filler === "Merrill").length;
  return (
    <div className="wr-report">
      <div className="sb-title">
        <h1>
          Washroom Prep List
          {shiftLabel && <span className="sb-title-shift"> · {shiftLabel}</span>}
        </h1>
      </div>
      <div className="sb-sub wr-sub">
        Changeovers expected from {lowerWhen(asOf, asOf)} to {lowerWhen(end, asOf)} (the end of the shift), first to
        last
      </div>
      <div className="sb-summary">
        <span>
          {rows.length} changeover{rows.length === 1 ? "" : "s"}
          {"  |  "}Oily parts: {oily} · Powdery parts: {rows.length - oily}
          {"  |  "}Allergen: {allergen}
          {"  |  "}Cremer: {cremer} · Merrill: {merrill}
        </span>
      </div>
      <table className="sb-table wr-table">
        <colgroup>
          {[3, 9, 6, 6, 9, 5, 22, 6, 6, 22, 6, 4].map((w, i) => (
            <col key={i} style={{ width: `${w}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {["#", "TIME", "LINE", "FILLER", "CHANGEOVER", "MIN", "OFF THE LINE - PARTS TO WASH", "TYPE", "ALLERGEN", "NEXT ON THE LINE", "TYPE", "DONE"].map((t, i) => (
              <th key={i}>{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={12} className="sb-empty">
                No changeovers expected before the end of the shift.
              </td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr key={`${r.line}-${r.next.id}`}>
              <td className="wr-num">{i + 1}</td>
              <td>{whenText(r.at, asOf)}</td>
              <td className="wr-line">{r.line}</td>
              <td className={`wr-filler wr-${r.filler.toLowerCase()}`}>{r.filler}</td>
              <td>
                <span className={`sb-co sb-co-${CODE_CLASS[r.code]}`}>{CHANGEOVER_LABELS[r.code as keyof typeof CHANGEOVER_LABELS]}</span>
              </td>
              <td className="wr-min">{r.minutes !== null ? `${r.minutes} min` : ""}</td>
              <td className="wr-wo">
                <span className="wr-item">{r.off.item}</span> {r.off.description}
              </td>
              <td className={`wr-type wr-${r.offType.toLowerCase()}`}>{r.offType}</td>
              <td className="wr-allergen">{r.offAllergen}</td>
              <td className="wr-wo">
                <span className="wr-item">{r.next.item}</span> {r.next.description}
              </td>
              <td className={`wr-type wr-${r.nextType.toLowerCase()}`}>{r.nextType}</td>
              <td className="wr-done">☐</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
