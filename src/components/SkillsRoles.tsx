import type { Employee } from "../types";
import { SKILL_KEYS, SKILL_LABELS, SKILL_MARK_OPTIONS } from "../types";

interface Props {
  employees: Employee[];
  setEmployees: (updater: (emps: Employee[]) => Employee[]) => void;
}

function blankEmployee(): Employee {
  return {
    id: crypto.randomUUID(),
    name: "",
    reportsTo: "",
    role: "",
    primaryLine: "",
    restricted: false,
    skills: { utility: "", casePacker: "", labeler: "", merrill: "", cremer: "", washroom: "" },
  };
}

function groupBy(employees: Employee[], key: (e: Employee) => string) {
  const map = new Map<string, Employee[]>();
  for (const e of employees) {
    const k = key(e).trim();
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(e);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export default function SkillsRoles({ employees, setEmployees }: Props) {
  function update(id: string, patch: Partial<Employee>) {
    setEmployees((emps) => emps.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  function updateSkill(id: string, skill: (typeof SKILL_KEYS)[number], value: string) {
    setEmployees((emps) => emps.map((e) => (e.id === id ? { ...e, skills: { ...e.skills, [skill]: value } } : e)));
  }
  function remove(id: string) {
    if (!confirm("Remove this employee?")) return;
    setEmployees((emps) => emps.filter((e) => e.id !== id));
  }
  function add() {
    setEmployees((emps) => [...emps, blankEmployee()]);
  }

  const byLine = groupBy(employees, (e) => e.primaryLine);
  const bySupervisor = groupBy(employees, (e) => e.reportsTo);

  return (
    <div>
      <div className="panel">
        <h2>Skills &amp; Roles</h2>
        <div className="schedule-table-wrap">
          <table className="roster">
            <thead>
              <tr>
                <th>Name</th>
                <th>Reports To</th>
                <th>Role</th>
                <th>Primary Line</th>
                <th>Restricted</th>
                {SKILL_KEYS.map((k) => (
                  <th key={k}>{SKILL_LABELS[k]}</th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td>
                    <input value={e.name} onChange={(ev) => update(e.id, { name: ev.target.value })} />
                    {e.restricted && <span className="restricted-badge">R</span>}
                  </td>
                  <td>
                    <input value={e.reportsTo} onChange={(ev) => update(e.id, { reportsTo: ev.target.value })} />
                  </td>
                  <td>
                    <input value={e.role} onChange={(ev) => update(e.id, { role: ev.target.value })} />
                  </td>
                  <td>
                    <input value={e.primaryLine} onChange={(ev) => update(e.id, { primaryLine: ev.target.value })} />
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={e.restricted}
                      onChange={(ev) => update(e.id, { restricted: ev.target.checked })}
                    />
                  </td>
                  {SKILL_KEYS.map((k) => (
                    <td key={k}>
                      <select
                        className={`mark-${e.skills[k]}`}
                        value={e.skills[k]}
                        onChange={(ev) => updateSkill(e.id, k, ev.target.value)}
                      >
                        {SKILL_MARK_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt || "—"}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}
                  <td>
                    <button className="btn small danger" onClick={() => remove(e.id)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn small" style={{ marginTop: 10 }} onClick={add}>
          + Add employee
        </button>
      </div>

      <div className="panel">
        <h2>Team Rosters by Line</h2>
        <div className="team-grid">
          {byLine.map(([line, emps]) => (
            <div className="team-card" key={line}>
              <h3>{line}</h3>
              <ul>
                {emps.map((e) => (
                  <li key={e.id}>
                    {e.name} <span style={{ color: "var(--muted)" }}>({e.role || "—"})</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {byLine.length === 0 && <div className="empty-state">No primary lines assigned yet.</div>}
        </div>
      </div>

      <div className="panel">
        <h2>Roster by Supervisor</h2>
        <div className="team-grid">
          {bySupervisor.map(([sup, emps]) => (
            <div className="team-card" key={sup}>
              <h3>{sup}</h3>
              <ul>
                {emps.map((e) => (
                  <li key={e.id}>
                    {e.name} <span style={{ color: "var(--muted)" }}>({e.primaryLine || "—"})</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {bySupervisor.length === 0 && <div className="empty-state">No supervisors assigned yet.</div>}
        </div>
      </div>
    </div>
  );
}
