"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * The work log, in both the shapes it is needed:
 *
 *   mode="employee" — your own notepad. Write a task, give it a deadline, tick it done when you
 *                     finish, and take the whole log away as a PDF whenever you like.
 *   mode="owner"    — one person at a time: assign work, tick what has actually been delivered,
 *                     score the week against the week's real numbers, and issue the report.
 *
 * Deliberately one component: the two sides must show the same rows the same way, or a review
 * conversation turns into an argument about whose screen is right.
 */

type Task = {
  id: string; seq: number; title: string; detail: string | null;
  source: "owner" | "self";
  assigned_at: string; due_at: string | null; done_at: string | null; delivered_at: string | null;
};
type Criterion = { id: string; label: string };
type Review = {
  id: string; week_start: string; scores: Record<string, number>;
  metrics: { name: string; target?: string; actual?: string; score?: number }[];
  note: string | null;
};
type Stats = {
  total: number; delivered: number; onTime: number; late: number; overdue: number; pending: number;
  onTimePct: number | null; deliveredPct: number | null; assignedByOwner: number; selfSet: number;
};
type Tenure = { weeks: number; average: number | null; perCriterion: Record<string, number>; stats: Stats; band: string };
type Member = { id: string; name: string; role?: string | null; track?: string | null; emp_type?: string | null; active?: number | boolean };

const INPUT = "w-full text-[13px] neu-inset text-foreground placeholder:text-faint rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-gold/25";
const GOLD = "btn-gold rounded-full font-[560]";
const GHOST = "rounded-full bg-card ring-hairline hover:bg-muted text-foreground font-[520] transition-colors";

const fmt = (iso: string | null, withTime = true) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: true } : {}),
  }).replace(",", "");
};

/** Same rule as the server, so the badge on screen and the badge in the PDF never disagree. */
function status(t: Task): { label: string; tone: string } {
  if (t.delivered_at) {
    if (!t.due_at) return { label: "Delivered", tone: "#1e7a44" };
    return Date.parse(t.delivered_at) <= Date.parse(t.due_at)
      ? { label: "On time", tone: "#1e7a44" }
      : { label: "Late", tone: "#b3341f" };
  }
  if (t.due_at && Date.now() > Date.parse(t.due_at)) return { label: "Overdue", tone: "#b3341f" };
  return { label: "Pending", tone: "#7a736a" };
}

/** A <input type="datetime-local"> value is local time; the server wants an instant. */
const toISO = (local: string) => (local ? new Date(local).toISOString() : null);
const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function WorkLog({ mode }: { mode: "employee" | "owner" }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tenure, setTenure] = useState<Tenure | null>(null);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [team, setTeam] = useState<Member[]>([]);
  // Every task in the company — what the per-person cards are built from.
  const [allTasks, setAllTasks] = useState<(Task & { employee_id: string })[]>([]);
  const [who, setWho] = useState("");              // owner mode: whose log is open
  const [giving, setGiving] = useState("");        // task id whose "give to" panel is open
  const [giveTo, setGiveTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Bumped on every successful write so the review panel re-reads the week it is showing.
  const [version, setVersion] = useState(0);

  // new task
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [due, setDue] = useState("");

  const load = useCallback(async (employeeId?: string) => {
    setErr("");
    try {
      const qs = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : "";
      const r = await fetch(`/api/portal/tasks${qs}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not load the work log");
      setCriteria(d.criteria || []);
      if (d.team) setTeam((d.team as Member[]).filter((m) => m.active !== 0));
      if (!employeeId && d.owner && Array.isArray(d.tasks)) setAllTasks(d.tasks);
      if (employeeId || !d.owner) {
        setTasks(d.tasks || []); setReviews(d.reviews || []);
        setStats(d.stats || null); setTenure(d.tenure || null);
      } else {
        setTasks([]); setReviews([]); setStats(null); setTenure(null);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not load the work log"); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (mode === "owner" && who) load(who); }, [who, mode, load]);

  /** Flip the row on screen at once; the reload right after is what confirms it. */
  const optimistic = (id: string, field: "delivered_at" | "done_at", on: boolean) =>
    setTasks((ts) => ts.map((t) => t.id === id ? { ...t, [field]: on ? new Date().toISOString() : null } : t));

  const post = async (body: any) => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/portal/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not save");
      await load(mode === "owner" ? who : undefined);
      setVersion((v) => v + 1);
      return true;
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); return false; }
    finally { setBusy(false); }
  };

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setErr("Write the task first");
    if (mode === "owner" && !who) return setErr("Pick who this task is for");
    const ok = await post({ action: "add", employeeId: who || undefined, title, detail, dueAt: toISO(due) });
    if (ok) { setTitle(""); setDetail(""); setDue(""); }
  }

  // Which task details are open. Every detail used to print in full, always: one task with a long
  // brief ran to eight hundred pixels on its own and pushed the page past four thousand.
  const [openDetail, setOpenDetail] = useState<Set<string>>(new Set());
  const toggleDetail = (id: string) =>
    setOpenDetail((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // Delivered work stays out of the way but never hidden — the count is always on screen.
  const [showDone, setShowDone] = useState(false);

  const person = team.find((m) => m.id === who);
  const pdfHref = (kind: "log" | "report") =>
    `/api/portal/worklog-pdf?kind=${kind}${mode === "owner" && who ? `&employeeId=${encodeURIComponent(who)}` : ""}`;

  // The page above supplies the title and the explanation; repeating them here read as a
  // duplicate heading.
  return (
    <section className="mt-6">
      {/* A dropdown hid the whole team behind one click and told you nothing until you picked
          someone. Cards show everyone at once, with what each person is actually carrying — so
          you can see who is loaded up and who is overdue before opening anybody. */}
      {/* Grouped by what people DO, because that is how work is actually thought about — and
          sorted so the ones carrying something come first. It used to be one flat grid in whatever
          order the database returned, with "no tasks yet" cards scattered between busy ones and
          rows that never lined up because every card was a different height. */}
      {mode === "owner" && !who && (() => {
        const load = (m: Member) => {
          const theirs = allTasks.filter((t) => t.employee_id === m.id);
          const open = theirs.filter((t) => !t.delivered_at);
          return {
            m, theirs, open,
            overdue: open.filter((t) => t.due_at && Date.now() > Date.parse(t.due_at)),
            delivered: theirs.length - open.length,
          };
        };
        const all = team.map(load);
        // Network partners are outside recruiters — no work log by design, so their cards would sit
        // here empty for ever. They belong on the network page, not this one.
        const staff = all.filter((x) => (x.m.emp_type || "") !== "partner");
        const busy = staff.filter((x) => x.theirs.length > 0);
        const idle = staff.filter((x) => x.theirs.length === 0);
        const groupOf = (m: Member) => (m.track || m.role || "Unassigned").trim() || "Unassigned";
        const groups = new Map<string, ReturnType<typeof load>[]>();
        for (const x of busy) {
          const g = groupOf(x.m);
          groups.set(g, [...(groups.get(g) || []), x]);
        }
        // Most work first, within a group and between them — the busiest is what wants attention.
        for (const [, list] of groups) {
          list.sort((a, b) => b.overdue.length - a.overdue.length || b.open.length - a.open.length || a.m.name.localeCompare(b.m.name));
        }
        const ordered = [...groups.entries()].sort((a, b) =>
          b[1].reduce((n, x) => n + x.open.length, 0) - a[1].reduce((n, x) => n + x.open.length, 0));
        const totOpen = busy.reduce((n, x) => n + x.open.length, 0);
        const totOver = busy.reduce((n, x) => n + x.overdue.length, 0);
        const totDone = busy.reduce((n, x) => n + x.delivered, 0);

        const Card = ({ x }: { x: ReturnType<typeof load> }) => (
          <button type="button" onClick={() => setWho(x.m.id)}
            className="card-lux rounded-2xl p-4 text-left flex flex-col hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_rgba(120,95,40,0.4)] transition-all">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="font-serif text-[15.5px] font-[600] truncate">{x.m.name}</span>
              {x.overdue.length > 0 && (
                <span className="shrink-0 text-[10.5px] font-[700] rounded-full px-2 py-0.5"
                  style={{ background: "rgba(179,52,31,0.10)", color: "#b3341f" }}>{x.overdue.length} overdue</span>
              )}
            </div>
            <div className="text-[12px] text-muted-foreground mb-2.5">
              {x.open.length} open · {x.delivered} delivered
            </div>
            {/* A fixed run of three keeps every card the same height, so the rows line up. */}
            <div className="flex-1">
              {x.open.slice(0, 3).map((t) => (
                <div key={t.id} className="text-[12px] truncate py-[3px] border-t border-border first:border-0">
                  <span className="font-mono text-faint mr-1.5">{t.seq}</span>
                  <span className={t.due_at && Date.now() > Date.parse(t.due_at) ? "text-[#b3341f]" : ""}>{t.title}</span>
                </div>
              ))}
              {x.open.length === 0 && <div className="text-[12px] text-faint py-[3px]">Nothing open — all delivered.</div>}
            </div>
            <div className="flex items-center justify-between gap-2 mt-2.5">
              <span className="text-[11.5px] font-semibold text-gold">Open full view →</span>
              {x.open.length > 3 && <span className="text-[11px] text-faint">+{x.open.length - 3} more</span>}
            </div>
          </button>
        );

        return (
          <div className="mb-4">
            {team.length === 0 ? (
              <div className="card-lux rounded-2xl px-5 py-8 text-center text-[13px] text-muted-foreground">No team members yet.</div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <Stat k="Open" v={String(totOpen)} />
                  <Stat k="Overdue" v={String(totOver)} tone={totOver ? "#b3341f" : undefined} />
                  <Stat k="Delivered" v={String(totDone)} />
                </div>

                {ordered.map(([group, list]) => (
                  <div key={group} className="mb-5">
                    <div className="flex items-baseline gap-2 mb-2">
                      <h3 className="font-serif text-[15px] font-[600]">{group}</h3>
                      <span className="text-[11.5px] text-faint">
                        {list.length} {list.length === 1 ? "person" : "people"} · {list.reduce((n, x) => n + x.open.length, 0)} open
                      </span>
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {list.map((x) => <Card key={x.m.id} x={x} />)}
                    </div>
                  </div>
                ))}

                {idle.length > 0 && (
                  <div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <h3 className="font-serif text-[15px] font-[600] text-muted-foreground">Nothing assigned yet</h3>
                      <span className="text-[11.5px] text-faint">{idle.length}</span>
                    </div>
                    {/* One line each. A full card for somebody with no work is a lot of space
                        spent saying nothing, and it is what broke the grid. */}
                    <div className="card-lux rounded-2xl divide-y divide-border overflow-hidden">
                      {idle.map((x) => (
                        <button key={x.m.id} type="button" onClick={() => setWho(x.m.id)}
                          className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors">
                          <span className="text-[13px] font-[560] truncate">{x.m.name}</span>
                          <span className="text-[11.5px] text-faint truncate">{groupOf(x.m)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {mode === "owner" && who && (
        <div className="card-lux rounded-2xl p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <button type="button" onClick={() => setWho("")} className="text-[12px] font-semibold text-gold hover:underline">← All people</button>
            <div className="font-serif text-[17px] font-[600] mt-0.5">{person?.name || "—"}</div>
            <div className="text-[12px] text-muted-foreground">{person?.role || person?.track || person?.emp_type || ""}</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <a href={pdfHref("log")} className={GHOST + " text-[12.5px] px-4 py-2.5 inline-block"}>↓ Work log</a>
            <a href={pdfHref("report")} className={GOLD + " text-[12.5px] px-4 py-2.5 inline-block"}>↓ Performance report</a>
          </div>
        </div>
      )}

      {err && <div className="rounded-xl border border-[#f0cfc7] bg-[#fdf1ee] text-[#8d2b18] text-[12.5px] px-4 py-2.5 mb-3">{err}</div>}

      {(mode === "employee" || who) && (
        <>
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <Stat k="Tasks" v={String(stats.total)} />
              <Stat k="Delivered" v={stats.deliveredPct != null ? `${stats.delivered} · ${stats.deliveredPct}%` : String(stats.delivered)} />
              <Stat k="On time" v={stats.onTimePct != null ? `${stats.onTimePct}%` : "—"} tone={stats.onTimePct != null && stats.onTimePct >= 80 ? "#1e7a44" : stats.onTimePct != null && stats.onTimePct < 50 ? "#b3341f" : undefined} />
              <Stat k={stats.overdue ? "Overdue" : "Still open"} v={String(stats.overdue || stats.pending)} tone={stats.overdue ? "#b3341f" : undefined} />
            </div>
          )}

          {/* ── the notepad ── */}
          <form onSubmit={addTask} className="card-lux rounded-2xl p-5 mb-4">
            <div className="font-serif text-[15px] font-[600] mb-3">
              {mode === "owner" ? `Give ${person?.name?.split(" ")[0] || "them"} a task` : "Add a task"}
            </div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is the task?" className={INPUT} />
            <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2}
              placeholder="Any detail (optional)" className={INPUT + " mt-2.5 resize-y"} />
            <div className="flex flex-wrap items-end gap-3 mt-2.5">
              <div className="flex-1 min-w-[200px]">
                <label className="section-label block mb-1">Deadline (optional)</label>
                <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={INPUT} />
              </div>
              <button type="submit" disabled={busy} className={GOLD + " px-5 py-2.5 text-[12.5px] disabled:opacity-50"}>
                {busy ? "Saving…" : "Add to log"}
              </button>
            </div>
            <p className="text-[11.5px] text-faint mt-2">
              A deadline is what lets the system tell you later whether it was delivered on time. Without one, the task is just recorded.
            </p>
          </form>

          {/* ── the log ── */}
          <div className="card-lux rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-baseline gap-2 flex-wrap">
                <b className="font-serif text-[15px] font-[600]">The log</b>
                <span className="text-[11.5px] text-faint">
                  {tasks.filter((t) => !t.delivered_at).length} open
                  {tasks.some((t) => t.delivered_at) && ` · ${tasks.filter((t) => t.delivered_at).length} delivered`}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Delivered work is never hidden — the count above says how much there is — but it
                    does not have to sit between the things that still need doing. */}
                {tasks.some((t) => t.delivered_at) && (
                  <button type="button" onClick={() => setShowDone((v) => !v)}
                    className={GHOST + " text-[12px] px-3.5 py-2"}>
                    {showDone ? "Hide delivered" : `Show delivered (${tasks.filter((t) => t.delivered_at).length})`}
                  </button>
                )}
                {tasks.some((t) => t.detail) && (
                  <button type="button"
                    onClick={() => setOpenDetail((s) => s.size ? new Set() : new Set(tasks.filter((t) => t.detail).map((t) => t.id)))}
                    className={GHOST + " text-[12px] px-3.5 py-2"}>
                    {openDetail.size ? "Collapse all" : "Expand all"}
                  </button>
                )}
                {mode === "employee" && (
                  <a href={pdfHref("log")} className={GHOST + " text-[12px] px-3.5 py-2 inline-block"}>↓ Download as PDF</a>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] min-w-[760px]">
                <thead><tr className="section-label bg-subtle/60">
                  <Th>#</Th><Th>Task</Th><Th>Given</Th><Th>Deadline</Th><Th>Delivered</Th><Th>Status</Th><Th r>{mode === "owner" ? "Delivered?" : "Done?"}</Th>
                </tr></thead>
                <tbody>
                  {tasks.length === 0 && (
                    <tr><td colSpan={7} className="text-center text-faint py-8">
                      Nothing here yet — add the first task above.
                    </td></tr>
                  )}
                  {/* Open work first and always shown; delivered work sits behind one click below.
                      Mixed together, a long finished task buried what still needs doing. */}
                  {(showDone ? tasks : tasks.filter((t) => !t.delivered_at)).map((t) => {
                    const st = status(t);
                    return (
                      <tr key={t.id} className="border-t border-border align-top">
                        <td className="px-4 py-3 font-mono text-muted-foreground">{t.seq}</td>
                        <td className="px-4 py-3">
                          {t.detail ? (
                            <button type="button" onClick={() => toggleDetail(t.id)}
                              className="text-left font-[560] hover:text-gold transition-colors">
                              {t.title}
                              <span className="ml-1.5 text-[11px] font-normal text-faint">
                                {openDetail.has(t.id) ? "− hide" : "+ detail"}
                              </span>
                            </button>
                          ) : (
                            <div className="font-[560]">{t.title}</div>
                          )}
                          {t.detail && openDetail.has(t.id) && (
                            <div className="text-[12px] text-muted-foreground mt-1 whitespace-pre-wrap">{t.detail}</div>
                          )}
                          <div className="text-[11px] text-faint mt-0.5">{t.source === "owner" ? "assigned" : "self-set"}</div>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-muted-foreground">{fmt(t.assigned_at)}</td>
                        <td className="px-4 py-3 text-[12px] text-muted-foreground">{fmt(t.due_at)}</td>
                        <td className="px-4 py-3 text-[12px] text-muted-foreground">{fmt(t.delivered_at)}</td>
                        <td className="px-4 py-3"><span className="font-[600] text-[12px]" style={{ color: st.tone }}>{st.label}</span></td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {mode === "owner" ? (
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={!!t.delivered_at} disabled={busy}
                                onChange={(e) => { optimistic(t.id, "delivered_at", e.target.checked); post({ action: "delivered", id: t.id, delivered: e.target.checked }); }} />
                              <span className="text-[12px] text-muted-foreground">{t.done_at ? "they marked done" : ""}</span>
                            </label>
                          ) : t.delivered_at ? (
                            // Once it's accepted there is nothing left to tick — an empty,
                            // disabled box next to the word "accepted" just read as a mistake.
                            <span className="text-[12px] font-[600] text-[#1e7a44]">✓ Accepted</span>
                          ) : (
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={!!t.done_at} disabled={busy}
                                onChange={(e) => { optimistic(t.id, "done_at", e.target.checked); post({ action: "done", id: t.id, done: e.target.checked }); }} />
                              <span className="text-[12px] text-muted-foreground">done</span>
                            </label>
                          )}
                          {mode === "owner" && (
                            <button type="button" title="Give this task to someone else" disabled={busy}
                              onClick={() => setGiving(giving === t.id ? "" : t.id)}
                              className="ml-2 text-[12px] font-semibold text-gold hover:underline disabled:opacity-40">give →</button>
                          )}
                          {(mode === "owner" || (t.source === "self" && !t.delivered_at)) && (
                            <button type="button" title="Remove this task" disabled={busy}
                              onClick={() => { if (confirm(`Remove task #${t.seq}?`)) post({ action: "delete", id: t.id }); }}
                              className="ml-2 text-[#b3341f] text-[15px] leading-none disabled:opacity-40">×</button>
                          )}

                          {/* Two different intentions, so two buttons rather than one ambiguous
                              "assign": handing the same work to a second person is not the same as
                              taking it off the first. */}
                          {giving === t.id && (
                            <div className="mt-2 p-2.5 rounded-xl bg-subtle/70 text-left inline-block min-w-[240px]">
                              <label className="section-label block mb-1">Give “{t.title.slice(0, 28)}{t.title.length > 28 ? "…" : ""}” to</label>
                              <select value={giveTo} onChange={(e) => setGiveTo(e.target.value)} className={INPUT + " appearance-none text-[12.5px] py-2"}>
                                <option value="">— pick a person —</option>
                                {team.filter((m) => m.id !== who).map((m) => (
                                  <option key={m.id} value={m.id}>{m.name}{m.role ? ` · ${m.role}` : ""}</option>
                                ))}
                              </select>
                              <div className="flex items-center gap-2 mt-2">
                                <button type="button" disabled={busy || !giveTo}
                                  onClick={async () => { if (await post({ action: "give", id: t.id, toEmployeeId: giveTo, copy: true })) { setGiving(""); setGiveTo(""); } }}
                                  className={GHOST + " text-[11.5px] px-3 py-1.5 disabled:opacity-40"}>Also give</button>
                                <button type="button" disabled={busy || !giveTo}
                                  onClick={async () => { if (await post({ action: "give", id: t.id, toEmployeeId: giveTo, copy: false })) { setGiving(""); setGiveTo(""); } }}
                                  className={GOLD + " text-[11.5px] px-3 py-1.5 disabled:opacity-40"}>Move</button>
                                <button type="button" onClick={() => { setGiving(""); setGiveTo(""); }}
                                  className="text-[11.5px] text-muted-foreground hover:underline">cancel</button>
                              </div>
                              <p className="text-[11px] text-faint mt-1.5">
                                <b>Also give</b> keeps it here too · <b>Move</b> takes it off {person?.name?.split(" ")[0] || "them"}.
                              </p>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {mode === "employee" && (
            <p className="text-[11.5px] text-faint mt-2">
              “Done” is you saying you’ve finished. The founder ticks “delivered” when it’s accepted — that’s what decides on time or late.
            </p>
          )}

          {mode === "owner" && who && (
            <ReviewPanel employeeId={who} criteria={criteria} refreshKey={version} onSaved={() => load(who)} />
          )}

          {/* ── tenure score ── */}
          {tenure && tenure.weeks > 0 && (
            <div className="card-lux rounded-2xl p-5 mt-4">
              <div className="font-serif text-[15px] font-[600] mb-1">
                {mode === "owner" ? "Whole-tenure score" : "Your overall score"}
              </div>
              <p className="text-[12.5px] text-muted-foreground mb-3">
                Every weekly review averaged, each week counting equally.
              </p>
              <div className="flex items-baseline gap-3 flex-wrap mb-3">
                <span className="text-[30px] font-extrabold font-mono tracking-tight text-gold">
                  {tenure.average != null ? tenure.average.toFixed(1) : "—"}<span className="text-[16px] text-muted-foreground"> / 5</span>
                </span>
                <span className="text-[14px] font-[600]">{tenure.band}</span>
                <span className="text-[12px] text-faint">across {tenure.weeks} week{tenure.weeks === 1 ? "" : "s"}</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {criteria.map((c) => tenure.perCriterion[c.id] != null && (
                  <div key={c.id} className="flex items-center justify-between text-[12.5px] border-b border-border py-1">
                    <span className="text-muted-foreground">{c.label}</span>
                    <b className="font-mono">{tenure.perCriterion[c.id].toFixed(1)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── past reviews (both sides see them; only the owner writes them) ── */}
          {reviews.length > 0 && (
            <div className="card-lux rounded-2xl overflow-hidden mt-4">
              <div className="px-5 py-3.5 border-b border-border"><b className="font-serif text-[15px] font-[600]">Weekly reviews</b></div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[620px]">
                  <thead><tr className="section-label bg-subtle/60">
                    <Th>Week of</Th>{criteria.map((c) => <Th key={c.id} r>{c.label.split(" ")[0]}</Th>)}<Th r>Avg</Th><Th>Note</Th>
                  </tr></thead>
                  <tbody>
                    {reviews.map((r) => {
                      const vals = criteria.map((c) => r.scores[c.id]).filter((n) => typeof n === "number");
                      const avg = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
                      return (
                        <tr key={r.id} className="border-t border-border align-top">
                          <td className="px-4 py-3 whitespace-nowrap">{fmt(`${r.week_start}T00:00:00+05:30`, false)}</td>
                          {criteria.map((c) => <td key={c.id} className="px-4 py-3 text-right font-mono">{r.scores[c.id] ?? "—"}</td>)}
                          <td className="px-4 py-3 text-right font-mono font-bold">{avg != null ? avg.toFixed(1) : "—"}</td>
                          <td className="px-4 py-3 text-[12px] text-muted-foreground">
                            {r.note}
                            {r.metrics?.length > 0 && (
                              <ul className="mt-1">
                                {r.metrics.map((m, i) => (
                                  <li key={i}>· {m.name}{m.target ? ` — target ${m.target}` : ""}{m.actual ? `, actual ${m.actual}` : ""}{m.score ? ` (${m.score}/5)` : ""}</li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}


    </section>
  );
}

/**
 * The weekly review.
 *
 * The week's real task numbers are loaded and shown ABOVE the scoring, on purpose: a review
 * written from memory drifts, and "3 of 5 delivered, 1 late" is the thing worth talking about.
 */
function ReviewPanel({ employeeId, criteria, refreshKey, onSaved }: { employeeId: string; criteria: Criterion[]; refreshKey: number; onSaved: () => void }) {
  const [week, setWeek] = useState("");
  const [data, setData] = useState<any>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [metrics, setMetrics] = useState<{ name: string; target: string; actual: string; score: string }[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const loadWeek = useCallback(async (w?: string) => {
    const r = await fetch(`/api/portal/reviews?employeeId=${encodeURIComponent(employeeId)}${w ? `&week=${w}` : ""}`, { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) return;
    setData(d); setWeek(d.week);
    setScores(d.existing?.scores || {});
    setNote(d.existing?.note || "");
    setMetrics((d.existing?.metrics || []).map((m: any) => ({
      name: m.name || "", target: m.target || "", actual: m.actual || "", score: m.score ? String(m.score) : "",
    })));
  }, [employeeId]);

  useEffect(() => { loadWeek(); }, [loadWeek]);
  // A task added or ticked off changes this week's figures — re-read them for the week on screen,
  // or the score is set against numbers that were true a minute ago.
  const shown = week;
  useEffect(() => { if (refreshKey && shown) loadWeek(shown); }, [refreshKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  const shift = (weeks: number) => {
    const d = new Date(`${week}T00:00:00+05:30`);
    d.setDate(d.getDate() + weeks * 7);
    loadWeek(d.toISOString().slice(0, 10));
  };

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/portal/reviews", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId, week, scores, note,
          metrics: metrics.filter((m) => m.name.trim()).map((m) => ({
            name: m.name, target: m.target, actual: m.actual, score: m.score ? Number(m.score) : undefined,
          })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not save");
      setMsg({ ok: true, t: "Review saved." });
      onSaved(); loadWeek(week);
    } catch (e) { setMsg({ ok: false, t: e instanceof Error ? e.message : "Could not save" }); }
    finally { setBusy(false); }
  }

  const ws = data?.weekStats;
  const scored = criteria.filter((c) => scores[c.id]).length;
  const avg = scored ? Math.round((criteria.reduce((a, c) => a + (scores[c.id] || 0), 0) / scored) * 10) / 10 : null;

  return (
    <div className="card-lux rounded-2xl p-5 mt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <div className="font-serif text-[15px] font-[600]">Weekly review</div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shift(-1)} className={GHOST + " text-[12px] px-3 py-1.5"}>← Previous</button>
          <span className="text-[12.5px] font-[560] font-mono">{week ? fmt(`${week}T00:00:00+05:30`, false) : "—"}</span>
          <button type="button" onClick={() => shift(1)} className={GHOST + " text-[12px] px-3 py-1.5"}>Next →</button>
        </div>
      </div>
      <p className="text-[12.5px] text-muted-foreground mb-3">Week beginning Monday. Re-opening a week edits that review rather than adding another.</p>

      {ws && (
        <div className="rounded-xl bg-subtle/60 px-4 py-3 mb-4 text-[12.5px]">
          <b className="section-label">That week, in fact</b>
          <div className="mt-1.5 text-muted-foreground">
            {ws.total === 0 ? "No tasks were recorded in this week." : (
              <>
                <b className="text-foreground">{ws.total}</b> task{ws.total === 1 ? "" : "s"} recorded ·{" "}
                <b className="text-foreground">{ws.delivered}</b> delivered
                {ws.onTimePct != null && <> · <b style={{ color: ws.onTimePct >= 80 ? "#1e7a44" : ws.onTimePct < 50 ? "#b3341f" : undefined }}>{ws.onTimePct}% on time</b></>}
                {ws.late > 0 && <> · <b style={{ color: "#b3341f" }}>{ws.late} late</b></>}
                {ws.overdue > 0 && <> · <b style={{ color: "#b3341f" }}>{ws.overdue} overdue</b></>}
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
        {criteria.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3">
            <span className="text-[13px]">{c.label}</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button"
                  onClick={() => setScores((s) => ({ ...s, [c.id]: s[c.id] === n ? 0 : n }))}
                  title={["Poor", "Needs development", "Meets expectations", "Good", "Excellent"][n - 1]}
                  className={"w-7 h-7 rounded-lg text-[12px] font-[600] transition-colors ring-1 " +
                    (scores[c.id] === n ? "btn-gold ring-transparent" : "bg-card ring-border hover:ring-[hsl(var(--gold)/0.5)]")}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="section-label">Your own metrics (optional)</label>
          <button type="button" onClick={() => setMetrics((m) => [...m, { name: "", target: "", actual: "", score: "" }])}
            className="text-[11.5px] font-semibold text-gold hover:underline">+ add a metric</button>
        </div>
        {metrics.map((m, i) => (
          <div key={i} className="flex flex-wrap gap-2 mb-2">
            <input value={m.name} onChange={(e) => setMetrics((a) => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
              placeholder="Metric (e.g. reels published)" className={INPUT + " flex-1 min-w-[160px] text-[12.5px] py-2"} />
            <input value={m.target} onChange={(e) => setMetrics((a) => a.map((x, j) => j === i ? { ...x, target: e.target.value } : x))}
              placeholder="Target" className={INPUT + " w-[90px] text-[12.5px] py-2"} />
            <input value={m.actual} onChange={(e) => setMetrics((a) => a.map((x, j) => j === i ? { ...x, actual: e.target.value } : x))}
              placeholder="Actual" className={INPUT + " w-[90px] text-[12.5px] py-2"} />
            <select value={m.score} onChange={(e) => setMetrics((a) => a.map((x, j) => j === i ? { ...x, score: e.target.value } : x))}
              className={INPUT + " w-[78px] text-[12.5px] py-2 appearance-none"}>
              <option value="">—/5</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5</option>)}
            </select>
            <button type="button" onClick={() => setMetrics((a) => a.filter((_, j) => j !== i))}
              className="text-[#b3341f] text-[15px] px-1">×</button>
          </div>
        ))}
      </div>

      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
        placeholder="What went well, what to fix next week" className={INPUT + " mt-3 resize-y"} />

      <div className="flex items-center gap-3 flex-wrap mt-3">
        <button type="button" onClick={save} disabled={busy} className={GOLD + " px-5 py-2.5 text-[12.5px] disabled:opacity-50"}>
          {busy ? "Saving…" : data?.existing ? "Update this week" : "Save review"}
        </button>
        {avg != null && <span className="text-[13px]">This week: <b className="font-mono">{avg.toFixed(1)} / 5</b></span>}
        {msg && <span className={"text-[12.5px] " + (msg.ok ? "text-[#1e7a44]" : "text-[#b3341f]")}>{msg.t}</span>}
      </div>
    </div>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="card-lux rounded-xl px-4 py-3.5">
      <div className="text-[11.5px] text-muted-foreground mb-1.5">{k}</div>
      <div className="text-[20px] font-extrabold font-mono tracking-tight" style={tone ? { color: tone } : {}}>{v}</div>
    </div>
  );
}
function Th({ children, r }: { children: React.ReactNode; r?: boolean }) {
  return <th className={"px-4 py-2.5 " + (r ? "text-right" : "text-left")}>{children}</th>;
}
