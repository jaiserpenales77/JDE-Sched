import type { NameStatus } from "./NameMultiSelect";

// "+ Add employee…" grouped so someone already placed or out today stands
// out from the people who still need a spot.
export default function PersonPicker({
  names,
  describe,
  onPick,
  className = "section-person-picker",
  label = "+ Add employee…",
}: {
  names: string[];
  describe: (name: string) => NameStatus;
  onPick: (name: string) => void;
  className?: string;
  label?: string;
}) {
  const free: string[] = [];
  const elsewhere: { name: string; note?: string }[] = [];
  const out: { name: string; note?: string }[] = [];
  for (const name of names) {
    const info = describe(name);
    if (info.status === "free") free.push(name);
    else if (info.status === "elsewhere") elsewhere.push({ name, note: info.note });
    else out.push({ name, note: info.note });
  }
  return (
    <select
      className={className}
      value=""
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        if (e.target.value) onPick(e.target.value);
      }}
    >
      <option value="">{label}</option>
      {free.length > 0 && (
        <optgroup label={`Not assigned yet (${free.length})`}>
          {free.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </optgroup>
      )}
      {elsewhere.length > 0 && (
        <optgroup label="Already placed elsewhere">
          {elsewhere.map(({ name, note }) => (
            <option key={name} value={name}>
              {name} — {note}
            </option>
          ))}
        </optgroup>
      )}
      {out.length > 0 && (
        <optgroup label="Out today">
          {out.map(({ name, note }) => (
            <option key={name} value={name}>
              {name} — {note}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
