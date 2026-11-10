import { Fragment } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { HolidayTheme } from "../holidayThemes";
import { HolidayIconSvg, HolidayStrip } from "./HolidayDecor";
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
  QA_QUALITY_CHECKS,
  QA_WALK_ROUNDS,
  whenText,
} from "../scheduleRun";
import type { QaChangeoverRow, QaWalkLine, WashroomRow } from "../scheduleRun";
import { BOX_COLUMNS, STATUS_CLASS } from "../scheduleBoxes";
import type { BoxColumnKey, BoxesView } from "../scheduleBoxes";

// The printed Production Schedule in the JDE Schedule workbook's look: each
// line a box in its status color, with progress, bottles left, crew, the
// estimated times and next shift's status; and the washroom prep list.

const statusClass = (s: RunStatus | "") => (s ? STATUS_CLASS[s] : "none");

const CODE_CLASS: Record<string, string> = { S1: "s1", "S1 Count Change": "count", S3: "s3", S4: "s4" };

// A gold four-point sparkle.
const Sparkle = () => (
  <svg className="sb-sparkle" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 0 L14.6 9.4 L24 12 L14.6 14.6 L12 24 L9.4 14.6 L0 12 L9.4 9.4 Z" fill="currentColor" />
  </svg>
);

// A holiday theme's greeting as a festive ribbon in the title bar: cream
// with gold trim and notched ends, the greeting in the theme's color, its
// icons and gold sparkles each side.
function GreetingBanner({ theme, date }: { theme: HolidayTheme; date: Date }) {
  const first = theme.strip[0];
  const second = theme.strip.find((i) => i.icon !== first.icon || i.color !== first.color) ?? first;
  return (
    <span className="sb-greeting" style={{ "--sb-greet": theme.greetingColor } as CSSProperties}>
      <HolidayIconSvg icon={first} />
      <Sparkle />
      <span className="sb-greeting-text">{theme.greeting(date)}</span>
      <Sparkle />
      <HolidayIconSvg icon={second} />
    </span>
  );
}

export function ScheduleBoxes({
  view,
  title,
  hidden = [],
  theme = null,
  stripCount = 36,
}: {
  view: BoxesView;
  title: string;
  hidden?: readonly string[];
  // A holiday theme: its color on the title bar, the band under it and the
  // column titles, its icons and greeting in the title bar, and a strip of
  // icons under the bar. The status colors never change.
  theme?: HolidayTheme | null;
  stripCount?: number;
}) {
  const cols = BOX_COLUMNS.filter((c) => !hidden.includes(c.key));
  const show = (key: BoxColumnKey) => cols.some((c) => c.key === key);
  // Note rows run from the column after WO to EST. TIME.
  const inner = cols.filter((c) => c.key !== "line" && c.key !== "next");
  const { asOf } = view;
  const date = asOf.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const n = view.summary.next;
  const themeVars = theme
    ? ({ "--sb-bar": theme.accent, "--sb-band": theme.tint, "--sb-band-text": theme.accent, "--sb-head": theme.accent } as CSSProperties)
    : undefined;
  const sideIcons = (order: 0 | 1) =>
    theme && (
      <span className="sb-title-icons" aria-hidden="true">
        <HolidayIconSvg icon={theme.side[order]} />
        <HolidayIconSvg icon={theme.side[1 - order]} />
      </span>
    );
  return (
    <div className={`sb-report${theme ? " sb-themed" : ""}`} style={themeVars}>
      <div className="sb-title">
        <h1>
          {sideIcons(0)}
          <span>
            {title}
            {view.shiftLabel && <span className="sb-title-shift"> · {view.shiftLabel}</span>}
          </span>
          {sideIcons(1)}
        </h1>
        {theme && <GreetingBanner theme={theme} date={asOf} />}
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
      {theme && <HolidayStrip theme={theme} count={stripCount} />}
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
          <span>
            Washroom Prep List
            {shiftLabel && <span className="sb-title-shift"> · {shiftLabel}</span>}
          </span>
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

const Box = () => <i className="qa-box">☐</i>;

function QaSignOff({ who }: { who: string }) {
  return (
    <div className="qa-foot">
      <span>
        <b>{who}:</b> ______________________
      </span>
      <span>
        <b>Date:</b> __________
      </span>
      <span>
        <b>Lead:</b> ______________________
      </span>
    </div>
  );
}

function QaWo({ wo }: { wo: { wo: string; item: string; description: string } }) {
  return (
    <>
      <b>{wo.wo}</b> · {wo.item}
      <span className="qa-desc">{wo.description}</span>
    </>
  );
}

// For QA: every changeover until the end of the shift, first to last, with
// the components that change, the line clearance, and the swab and
// allergen tests to tick and sign.
export function QaChangeoverList({
  rows,
  asOf,
  end,
  shiftLabel,
}: {
  rows: QaChangeoverRow[];
  asOf: Date;
  end: Date;
  shiftLabel: string;
}) {
  const date = asOf.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const major = rows.filter((r) => r.major).length;
  return (
    <div className="wr-report qa-report">
      <div className="sb-title">
        <h1>
          <span>
            QA Changeover List
            {shiftLabel && <span className="sb-title-shift"> · {shiftLabel}</span>}
          </span>
        </h1>
        <span className="qa-title-note">Components, line clearance, swab and allergen tests, first to last</span>
      </div>
      <div className="sb-sub wr-sub">
        {date} · as of {clockText(asOf)}, to the end of the shift ({lowerWhen(end, asOf)})
      </div>
      <div className="sb-summary">
        <span>
          {rows.length} changeover{rows.length === 1 ? "" : "s"}
          {"  |  "}
          {major} major (full line clearance) · {rows.length - major} minor
          {"  |  "}Allergen test required: {rows.filter((r) => r.allergenTestRequired).length}
          {"  |  "}International: {rows.filter((r) => r.international).length}
        </span>
      </div>
      <table className="sb-table qa-table">
        <colgroup>
          {[2.6, 8, 5.6, 8.4, 14, 14, 16.4, 11.5, 6, 6.5, 7].map((w, i) => (
            <col key={i} style={{ width: `${w}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {["#", "TIME", "LINE", "CHANGEOVER", "OFF THE LINE", "NEXT ON THE LINE", "COMPONENTS (WHAT CHANGES)", "LINE CLEAR OF THE LAST WO", "SWAB TEST", "ALLERGEN TEST", "QA"].map((t) => (
              <th key={t}>{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={11} className="sb-empty">
                No changeovers expected before the end of the shift.
              </td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr
              key={`${r.line}-${r.next.id}`}
              className={`qa-row${r.major ? " qa-major" : ""}${r.allergenTestRequired ? " qa-allergen" : ""}`}
            >
              <td className="wr-num">{i + 1}</td>
              <td className="qa-time">{whenText(r.at, asOf)}</td>
              <td className="wr-line">{r.line}</td>
              <td>
                <span className={`sb-co sb-co-${CODE_CLASS[r.code]}`}>
                  {CHANGEOVER_LABELS[r.code as keyof typeof CHANGEOVER_LABELS]}
                </span>
                {(r.offAllergen || r.nextAllergen) && (
                  <span className="qa-tag">
                    ALLERGEN {r.offAllergen || "N"} → {r.nextAllergen || "N"}
                  </span>
                )}
                {r.international && <span className="qa-tag qa-tag-intl">INTERNATIONAL</span>}
              </td>
              <td>
                <QaWo wo={r.off} />
              </td>
              <td>
                <QaWo wo={r.next} />
              </td>
              <td className="qa-checks">
                {(r.checks.length ? r.checks : [r.sameItem ? "Same components (same item)" : "Same components"]).map((c) => (
                  <div key={c} className="qa-check">
                    <Box />
                    {c}
                  </div>
                ))}
              </td>
              <td>
                <div className="qa-check qa-wrap">
                  <Box />
                  No {r.off.item.trim() || "product"} left on the line
                </div>
                <div className="qa-small">{r.major ? "full clearance (major)" : "minor"}</div>
              </td>
              <td>
                <div className="qa-check">
                  <Box />
                  Done
                </div>
                <div className="qa-check">
                  <Box />
                  N/A
                </div>
              </td>
              <td>
                {r.allergenTestRequired ? (
                  <>
                    <div className="qa-required">REQUIRED</div>
                    <div className="qa-check">
                      <Box />
                      Pass
                    </div>
                    <div className="qa-check">
                      <Box />
                      Fail
                    </div>
                  </>
                ) : (
                  <>
                    <div className="qa-check">
                      <Box />
                      Done
                    </div>
                    <div className="qa-check">
                      <Box />
                      N/A
                    </div>
                  </>
                )}
              </td>
              <td className="qa-sign">
                <div className="qa-line" />
                <div className="qa-small">initials · time</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="qa-key">
        Every changeover: check the components that change and that nothing from the last WO is left on the line. Major
        (S3 / S4, red edge) = full line clearance. The allergen test is REQUIRED when an allergen comes off the line;
        otherwise tick Done or N/A, as for the swab test. Times are estimates.
      </p>
      <QaSignOff who="Reviewed by (QA)" />
    </div>
  );
}

// For QA's Gemba walk: what should be on each line right now, to check on
// every round, and the lines that should be idle and clear.
export function QaWalkSheet({
  lines,
  asOf,
  shiftLabel,
}: {
  lines: QaWalkLine[];
  asOf: Date;
  shiftLabel: string;
}) {
  const date = asOf.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const running = lines.filter((l) => l.wo);
  const allergenLines = running.filter((l) => l.components.some((c) => c.flag));
  const rounds = Array.from({ length: QA_WALK_ROUNDS }, (_, i) => i + 1);
  const nextUp = running
    .filter((l) => l.nextChangeover)
    .sort((a, b) => a.nextChangeover!.at.getTime() - b.nextChangeover!.at.getTime())[0];
  return (
    <div className="wr-report qa-report">
      <div className="sb-title">
        <h1>
          <span>
            QA Gemba Walk
            {shiftLabel && <span className="sb-title-shift"> · {shiftLabel}</span>}
          </span>
        </h1>
        <span className="qa-title-note">What should be on each line right now: check it on every round</span>
      </div>
      <div className="sb-sub wr-sub">
        {date} · as of {clockText(asOf)}
      </div>
      <div className="sb-summary">
        <span>
          {running.length} line{running.length === 1 ? "" : "s"} running · {lines.length - running.length} not running
          {allergenLines.length > 0 && (
            <>
              {"  |  "}Allergen on a line:{" "}
              {allergenLines.map((l) => `${l.name} (${l.components.find((c) => c.flag)!.value})`).join(", ")}
            </>
          )}
          {nextUp && (
            <>
              {"  |  "}Next changeover: {nextUp.name} at {clockText(nextUp.nextChangeover!.at)} (see the QA Changeover
              List)
            </>
          )}
        </span>
      </div>
      <table className="sb-table qa-table qa-walk">
        <colgroup>
          {[8, 17, 23, 13, ...rounds.map(() => 28.5 / QA_WALK_ROUNDS), 10.5].map((w, i) => (
            <col key={i} style={{ width: `${w}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th>LINE</th>
            <th>RUNNING NOW</th>
            <th>COMPONENTS: WHAT SHOULD BE ON THE LINE</th>
            <th>PRODUCT QUALITY</th>
            {rounds.map((n) => (
              <th key={n}>ROUND {n}</th>
            ))}
            <th>NOTES</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const allergen = l.components.find((c) => c.flag);
            const statusCls = l.status ? STATUS_CLASS[l.status] : "none";
            return (
              <tr key={l.name} className={`qa-row${l.wo ? "" : " qa-idle"}${allergen ? " qa-allergen" : ""}`}>
                <td className={`qa-linecell sb-st-${statusCls}`}>
                  <b>{l.name}</b>
                  <span>{l.status || "NO STATUS"}</span>
                </td>
                {l.wo ? (
                  <>
                    <td>
                      <QaWo wo={l.wo} />
                      <span className="qa-next">
                        {l.wo.percentComplete ? `${Math.round(Number(l.wo.percentComplete))}% done` : "Not started"}
                        {l.nextChangeover &&
                          ` · next: ${clockText(l.nextChangeover.at)} · ${CHANGEOVER_LABELS[l.nextChangeover.code as keyof typeof CHANGEOVER_LABELS]}`}
                      </span>
                      {allergen && <span className="qa-tag">ALLERGEN {allergen.value}</span>}
                    </td>
                    <td>
                      <div className="qa-two">
                        {l.components.map((c) => (
                          <div key={c.label} className={`qa-check${c.flag ? " qa-flag" : ""}`}>
                            <Box />
                            <span className="qa-k">{c.label}</span> <b>{c.value}</b>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>
                      {QA_QUALITY_CHECKS.map((q) => (
                        <div key={q} className="qa-check qa-wrap">
                          <Box />
                          {q}
                        </div>
                      ))}
                    </td>
                  </>
                ) : (
                  <td colSpan={3} className="qa-idletext">
                    <Box />
                    Line idle and clear: no product or components left from the last WO
                  </td>
                )}
                {rounds.map((n) => (
                  <td key={n} className="qa-round">
                    <div className="qa-time-blank">__:__</div>
                    {l.wo && (
                      <div className="qa-ok">
                        <Box />
                        OK <Box />
                        Issue
                      </div>
                    )}
                    <div className="qa-line" />
                    <div className="qa-small">initials</div>
                  </td>
                ))}
                <td />
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="qa-key">
        Each round: tick each component that matches the running WO and each quality check, then write the time and
        your initials and tick OK or Issue (describe it in Notes). Allergen lines are tinted. Lines not running: check
        they're idle and clear. If a WO has changed over since this was printed, use the QA Changeover List or print a
        new one.
      </p>
      <QaSignOff who="QA" />
    </div>
  );
}
