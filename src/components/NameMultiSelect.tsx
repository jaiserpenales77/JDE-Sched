import { useState } from "react";

interface Props {
  value: string; // comma-separated names, same storage format as before
  onChange: (next: string) => void;
  options: string[]; // employee names to pick from (already cleaned)
}

function parseNames(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function NameMultiSelect({ value, onChange, options }: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");

  const selected = parseNames(value);
  const available = options.filter((name) => !selected.includes(name));

  function addName(name: string) {
    const trimmed = name.trim();
    if (!trimmed || selected.includes(trimmed)) return;
    onChange([...selected, trimmed].join(", "));
  }
  function removeName(name: string) {
    onChange(selected.filter((n) => n !== name).join(", "));
  }
  function commitCustom() {
    addName(customText);
    setCustomText("");
    setCustomOpen(false);
  }

  return (
    <div className="name-multiselect">
      <div className="name-chips">
        {selected.length === 0 && <span className="name-chips-empty">No one assigned</span>}
        {selected.map((name) => (
          <span className="name-chip" key={name}>
            {name}
            <button type="button" onClick={() => removeName(name)} title={`Remove ${name}`}>
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="name-add-row">
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) addName(e.target.value);
          }}
        >
          <option value="">+ Add employee…</option>
          {available.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {!customOpen && (
          <button type="button" className="btn small" onClick={() => setCustomOpen(true)}>
            + Other
          </button>
        )}
      </div>
      {customOpen && (
        <div className="name-add-row">
          <input
            type="text"
            placeholder="Type a name"
            value={customText}
            autoFocus
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitCustom();
              } else if (e.key === "Escape") {
                setCustomOpen(false);
                setCustomText("");
              }
            }}
          />
          <button type="button" className="btn small" onClick={commitCustom}>
            Add
          </button>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setCustomOpen(false);
              setCustomText("");
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
