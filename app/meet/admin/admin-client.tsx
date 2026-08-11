"use client";
import { useCallback, useEffect, useState } from "react";
import { LogoMark } from "@/components/ui/logo";

type Member = { id: string; name: string; email: string; timezone: string; active: boolean; is_organizer: boolean; googleConnected: boolean; googleEmail: string | null; zohoConnected: boolean; zohoEmail: string | null; connectLink: string; zohoConnectLink: string };
type Question = { id?: string; label: string; required: boolean };
type MType = { id: string; name: string; slug: string; duration_min: number; buffer_before_min: number; buffer_after_min: number; min_notice_min: number; slot_granularity_min: number; mode: "any" | "all"; member_ids: string[]; description: string; active: boolean; max_advance_days?: number; followup_enabled?: boolean; questions?: Question[]; price_inr?: number; requires_approval?: boolean; durations?: number[] };
type Coupon = { code: string; kind: "percent" | "flat"; value: number; active: boolean; max_uses: number; uses: number };
type Answer = { q: string; a: string };
type Booking = { id: string; client_name: string; client_email: string; start_utc: string; end_utc: string; status: string; meet_link: string | null; meetingTypeName: string; memberNames: string[]; member_ids: string[]; cancel_token: string | null; answers?: Answer[]; attendance?: string | null; client_notes?: string };
type Analytics = { total: number; confirmed: number; cancelled: number; noShow: number; attended: number; thisWeek: number; last30: number; byType: { name: string; count: number }[]; byWeekday: number[]; byHour: number[]; perWeek: { week: string; count: number }[] };
type Tab = "calendar" | "members" | "types" | "availability" | "bookings" | "analytics";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const card = "card-lux rounded-3xl p-6 sm:p-7";
const input = "w-full text-[14px] neu-inset text-foreground placeholder:text-faint rounded-[12px] px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-gold/25";
const label = "block text-[12px] font-medium text-foreground/70 mb-1.5";
const chip = "neu-chip rounded-full px-2.5 py-1 text-[11.5px] font-[560]";
const btnGold = "btn-gold rounded-full px-5 py-2.5 font-[560] text-[13px] disabled:opacity-60";
const btnNeu = "btn-neu rounded-full px-4 py-2 text-[12.5px] font-semibold";
const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Request failed");
  return d;
}

export default function MeetAdmin({ googleReady }: { googleReady: boolean }) {
  const [tab, setTab] = useState<Tab>("members");
  const [origin, setOrigin] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [types, setTypes] = useState<MType[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [zohoReady, setZohoReady] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => { setOrigin(window.location.origin); }, []);
  const loadMembers = useCallback(async () => { try { const d = await api("/api/meet/admin/members"); setMembers(d.members); setZohoReady(!!d.zohoConfigured); } catch (e) { setErr(msg(e)); } }, []);
  const loadTypes = useCallback(async () => { try { setTypes((await api("/api/meet/admin/types")).types); } catch (e) { setErr(msg(e)); } }, []);
  const loadBookings = useCallback(async () => { try { setBookings((await api("/api/meet/admin/bookings")).bookings); } catch (e) { setErr(msg(e)); } }, []);
  useEffect(() => { loadMembers(); loadTypes(); loadBookings(); }, [loadMembers, loadTypes, loadBookings]);

  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  async function refreshAll() { setRefreshing(true); try { await Promise.all([loadMembers(), loadTypes(), loadBookings()]); setRefreshTick((t) => t + 1); } finally { setRefreshing(false); } }

  function copy(text: string, id: string) { navigator.clipboard?.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(""), 1600); }); }

  return (
    <div className="max-w-[980px] mx-auto px-5 py-10">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <LogoMark size={32} />
          <div><div className="font-serif text-[18px] font-[600] leading-none">Avloryn <span className="text-gold">Labs</span></div><div className="section-label mt-1.5">Scheduling</div></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshAll} disabled={refreshing} className={btnNeu + " disabled:opacity-60"}>{refreshing ? "Refreshing…" : "↻ Refresh"}</button>
          <a href="/portal" className={btnNeu}>← Portal</a>
        </div>
      </div>

      {!googleReady && <div className="rounded-2xl bg-[#fff7e6] border border-[#f0dca8] px-4 py-3 mb-5 text-[12.5px] text-[#7a5c15]">Google isn&rsquo;t configured yet — set <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code>. Everything else still works.</div>}
      {err && <div className="text-[13px] text-[#b3341f] bg-[#fdeeea] border border-[#f3cfc6] rounded-xl px-3 py-2 mb-5">{err} <button onClick={() => setErr("")} className="ml-2 underline">dismiss</button></div>}

      <div className="flex gap-2 mb-6 overflow-x-auto">
        {(["calendar", "members", "types", "availability", "bookings", "analytics"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`shrink-0 rounded-full px-4 py-2 text-[12.5px] font-[560] capitalize transition ${tab === t ? "btn-gold" : "neu-chip text-foreground/70"}`}>{t === "types" ? "Meeting types" : t}</button>
        ))}
      </div>

      {tab === "calendar" && <TeamCalendar bookings={bookings} members={members} reload={loadBookings} refreshTick={refreshTick} />}
      {tab === "members" && <MembersTab members={members} reload={loadMembers} copy={copy} copied={copied} origin={origin} zohoReady={zohoReady} />}
      {tab === "types" && <TypesTab types={types} members={members} reload={loadTypes} copy={copy} copied={copied} origin={origin} />}
      {tab === "availability" && <AvailabilityTab members={members} />}
      {tab === "bookings" && <BookingsTab bookings={bookings} reload={loadBookings} members={members} copy={copy} copied={copied} />}
      {tab === "analytics" && <AnalyticsTab />}
    </div>
  );
}

/* ─────────────── Members ─────────────── */
function MembersTab({ members, reload, copy, copied, origin, zohoReady }: { members: Member[]; reload: () => void; copy: (t: string, id: string) => void; copied: string; origin: string; zohoReady: boolean }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [tz, setTz] = useState("Asia/Kolkata");
  const [busy, setBusy] = useState(false); const [e, setE] = useState("");
  const [team, setTeam] = useState<{ name: string; email: string }[]>([]); const [pick, setPick] = useState("");
  const [reveal, setReveal] = useState<Set<string>>(new Set());
  const toggleReveal = (id: string) => setReveal((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  useEffect(() => { fetch("/api/meet/admin/team").then((r) => r.json()).then((d) => setTeam(d.team || [])).catch(() => {}); }, []);
  const haveEmails = new Set(members.map((m) => (m.email || "").toLowerCase()));
  const addable = team.filter((p) => p.email && !haveEmails.has(p.email.toLowerCase()));
  async function add(ev: React.FormEvent) { ev.preventDefault(); setBusy(true); setE(""); try { await api("/api/meet/admin/members", "POST", { name, email, timezone: tz }); setName(""); setEmail(""); reload(); } catch (x) { setE(msg(x)); } finally { setBusy(false); } }
  async function addFromTeam() { const p = addable.find((x) => x.email === pick); if (!p) return; setBusy(true); setE(""); try { await api("/api/meet/admin/members", "POST", { name: p.name, email: p.email, timezone: "Asia/Kolkata" }); setPick(""); reload(); } catch (x) { setE(msg(x)); } finally { setBusy(false); } }
  async function del(id: string) { if (!confirm("Remove this member?")) return; try { await api(`/api/meet/admin/members?id=${id}`, "DELETE"); reload(); } catch (x) { alert(msg(x)); } }
  async function toggleOrg(m: Member) { try { await api("/api/meet/admin/members", "PATCH", { id: m.id, is_organizer: !m.is_organizer }); reload(); } catch (x) { alert(msg(x)); } }

  return (
    <div className="grid gap-5">
      <div className={card}>
        <h2 className="font-serif text-[19px] font-[600] mb-4">Team members</h2>
        <div className="grid gap-3">
          {members.length === 0 && <p className="text-[13px] text-muted-foreground">No members yet — add your first below.</p>}
          {members.map((m) => (
            <div key={m.id} className="neu-inset rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-[14px] font-[600] flex items-center gap-2 flex-wrap">{m.name}
                    {m.is_organizer && <span className={chip + " text-gold"}>Organizer</span>}
                    {m.googleConnected ? <span className={chip + " text-[#2b7a4b]"}>Google ✓</span> : <span className={chip + " text-[#b3341f]"}>Google —</span>}
                    {m.zohoConnected && <span className={chip + " text-[#2b7a4b]"}>Zoho ✓</span>}
                  </div>
                  <div className="text-[12.5px] text-muted-foreground">{m.email}</div>
                  <div className="text-[11.5px] text-faint mt-0.5">{m.timezone}{m.googleEmail ? ` · G:${m.googleEmail}` : ""}{m.zohoEmail ? ` · Z:${m.zohoEmail}` : ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleOrg(m)} className={btnNeu}>{m.is_organizer ? "Unset organizer" : "Make organizer"}</button>
                  <button onClick={() => del(m.id)} className="text-[12px] font-semibold text-[#b3341f] hover:underline">Remove</button>
                </div>
              </div>
              {(() => {
                const rv = reveal.has(m.id);
                const anyConnected = m.googleConnected || (zohoReady && m.zohoConnected);
                return (
                  <div className="mt-3 space-y-1.5">
                    {rv && (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10.5px] text-faint w-[42px] shrink-0">Google</span>
                          <input readOnly value={origin + m.connectLink} className="flex-1 min-w-0 neu-inset rounded-lg px-2.5 py-1.5 text-[11px] text-faint truncate" onFocus={(ev) => ev.currentTarget.select()} />
                          <button onClick={() => copy(origin + m.connectLink, "g-" + m.id)} className="btn-gold rounded-lg px-2.5 py-1.5 text-[11px] font-[560] shrink-0">{copied === "g-" + m.id ? "✓" : "Copy"}</button>
                        </div>
                        {zohoReady && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10.5px] text-faint w-[42px] shrink-0">Zoho</span>
                            <input readOnly value={origin + m.zohoConnectLink} className="flex-1 min-w-0 neu-inset rounded-lg px-2.5 py-1.5 text-[11px] text-faint truncate" onFocus={(ev) => ev.currentTarget.select()} />
                            <button onClick={() => copy(origin + m.zohoConnectLink, "z-" + m.id)} className="btn-gold rounded-lg px-2.5 py-1.5 text-[11px] font-[560] shrink-0">{copied === "z-" + m.id ? "✓" : "Copy"}</button>
                          </div>
                        )}
                        <p className="text-[10.5px] text-faint">Send the link to {m.name.split(" ")[0]} — they open it &amp; grant calendar access.</p>
                      </>
                    )}
                    <button onClick={() => toggleReveal(m.id)} className="text-[10.5px] font-semibold text-gold hover:underline">
                      {rv ? "Hide link" : anyConnected ? "Show connect link (to reconnect)" : "Show connect link"}
                    </button>
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      </div>
      <div className={card}>
        <h3 className="font-serif text-[17px] font-[600] mb-1">Add from your team</h3>
        <p className="text-[12.5px] text-muted-foreground mb-4">Pick a company employee — name &amp; email fill in automatically.</p>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={pick} onChange={(x) => setPick(x.target.value)} className={input + " sm:max-w-sm"}>
            <option value="">{addable.length ? "Choose a team member…" : "Everyone's already added"}</option>
            {addable.map((p) => <option key={p.email} value={p.email}>{p.name} — {p.email}</option>)}
          </select>
          <button onClick={addFromTeam} disabled={busy || !pick} className={btnGold + " shrink-0"}>Add member</button>
        </div>
      </div>
      <div className={card}>
        <h3 className="font-serif text-[17px] font-[600] mb-1">Add someone else</h3>
        <p className="text-[12.5px] text-muted-foreground mb-4">For a member who isn&rsquo;t in the employee list.</p>
        <form onSubmit={add} className="grid sm:grid-cols-3 gap-3">
          <div><label className={label}>Name</label><input value={name} onChange={(x) => setName(x.target.value)} className={input} required /></div>
          <div><label className={label}>Email</label><input type="email" value={email} onChange={(x) => setEmail(x.target.value)} className={input} required /></div>
          <div><label className={label}>Timezone</label><input value={tz} onChange={(x) => setTz(x.target.value)} className={input} /></div>
          <div className="sm:col-span-3 flex items-center gap-3"><button type="submit" disabled={busy} className={btnGold}>{busy ? "Adding…" : "Add member"}</button>{e && <span className="text-[12.5px] text-[#b3341f]">{e}</span>}</div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────── Meeting types ─────────────── */
const EMPTY_TYPE = { name: "", duration_min: 30, buffer_before_min: 0, buffer_after_min: 10, min_notice_min: 120, slot_granularity_min: 30, max_advance_days: 60, mode: "any" as "any" | "all", member_ids: [] as string[], description: "", followup_enabled: false, questions: [] as Question[], price_inr: 0, durationsText: "", requires_approval: false, organizer_id: "" };
const parseDurations = (s: string): number[] => [...new Set(s.split(/[,\s]+/).map((x) => Math.round(Number(x))).filter((n) => n > 0 && n <= 600))].sort((a, b) => a - b);

function TypesTab({ types, members, reload, copy, copied, origin }: { types: MType[]; members: Member[]; reload: () => void; copy: (t: string, id: string) => void; copied: string; origin: string }) {
  const [form, setForm] = useState({ ...EMPTY_TYPE });
  const [busy, setBusy] = useState(false); const [e, setE] = useState("");
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  async function create(ev: React.FormEvent) { ev.preventDefault(); setBusy(true); setE(""); try { await api("/api/meet/admin/types", "POST", { ...form, durations: parseDurations(form.durationsText) }); setForm({ ...EMPTY_TYPE }); reload(); } catch (x) { setE(msg(x)); } finally { setBusy(false); } }
  async function toggleActive(t: MType) { try { await api("/api/meet/admin/types", "PATCH", { id: t.id, active: !t.active }); reload(); } catch (x) { alert(msg(x)); } }
  async function del(id: string) { if (!confirm("Delete this meeting type?")) return; try { await api(`/api/meet/admin/types?id=${id}`, "DELETE"); reload(); } catch (x) { alert(msg(x)); } }
  function toggleMember(id: string) {
    setForm((f) => {
      const has = f.member_ids.includes(id);
      const member_ids = has ? f.member_ids.filter((x) => x !== id) : [...f.member_ids, id];
      const organizer_id = has && f.organizer_id === id ? "" : f.organizer_id;
      return { ...f, member_ids, organizer_id };
    });
  }
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name || "—";
  // questions editor
  const addQ = () => set("questions", [...form.questions, { label: "", required: false }]);
  const updQ = (i: number, patch: Partial<Question>) => set("questions", form.questions.map((q, idx) => idx === i ? { ...q, ...patch } : q));
  const delQ = (i: number) => set("questions", form.questions.filter((_, idx) => idx !== i));

  return (
    <div className="grid gap-5">
      <div className={card}>
        <h2 className="font-serif text-[19px] font-[600] mb-1">Meeting types</h2>
        <p className="text-[12.5px] text-muted-foreground mb-4">Each type has a shareable link — send it to people so they can pick a time.</p>
        <div className="grid gap-3">
          {types.length === 0 && <p className="text-[13px] text-muted-foreground">No meeting types yet — create one below.</p>}
          {types.map((t) => {
            const link = `${origin}/meet/${t.slug}`;
            const embed = `<iframe src="${link}?embed=1" style="width:100%;height:820px;border:0" title="${t.name}"></iframe>`;
            return (
              <div key={t.id} className="neu-inset rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-[14.5px] font-[600] flex items-center gap-2">{t.name}{!t.active && <span className={chip + " text-[#b3341f]"}>Paused</span>}</div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">{t.duration_min} min · {t.mode === "all" ? "Group" : "1-on-1"} · {t.member_ids.map(nameOf).join(", ")}{t.price_inr ? ` · ₹${t.price_inr}` : " · free"}{t.requires_approval ? " · approval" : ""}{t.followup_enabled ? " · follow-up" : ""}{t.questions?.length ? ` · ${t.questions.length}Q` : ""}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleActive(t)} className={btnNeu}>{t.active ? "Pause" : "Resume"}</button>
                    <button onClick={() => del(t.id)} className="text-[12px] font-semibold text-[#b3341f] hover:underline">Delete</button>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <input readOnly value={link} className={input + " text-[11.5px] text-faint"} onFocus={(ev) => ev.currentTarget.select()} />
                  <button onClick={() => copy(link, "bl-" + t.id)} className={btnNeu + " shrink-0"}>{copied === "bl-" + t.id ? "Copied ✓" : "Booking link"}</button>
                  <button onClick={() => copy(embed, "em-" + t.id)} className={btnNeu + " shrink-0"}>{copied === "em-" + t.id ? "Copied ✓" : "Embed"}</button>
                  <a href={link} target="_blank" rel="noopener noreferrer" className={btnNeu + " shrink-0"}>Open</a>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={card}>
        <h3 className="font-serif text-[17px] font-[600] mb-4">New meeting type</h3>
        <form onSubmit={create} className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label className={label}>Name</label><input value={form.name} onChange={(x) => set("name", x.target.value)} placeholder="e.g. Intro call" className={input} required /></div>
          <div><label className={label}>Duration (min)</label><input type="number" min={5} step={5} value={form.duration_min} onChange={(x) => set("duration_min", +x.target.value)} className={input} /></div>
          <div><label className={label}>Slot every (min)</label><input type="number" min={5} step={5} value={form.slot_granularity_min} onChange={(x) => set("slot_granularity_min", +x.target.value)} className={input} /></div>
          <div><label className={label}>Buffer before (min)</label><input type="number" min={0} step={5} value={form.buffer_before_min} onChange={(x) => set("buffer_before_min", +x.target.value)} className={input} /></div>
          <div><label className={label}>Buffer after (min)</label><input type="number" min={0} step={5} value={form.buffer_after_min} onChange={(x) => set("buffer_after_min", +x.target.value)} className={input} /></div>
          <div><label className={label}>Min notice (min)</label><input type="number" min={0} step={30} value={form.min_notice_min} onChange={(x) => set("min_notice_min", +x.target.value)} className={input} /></div>
          <div><label className={label}>Bookable up to (days ahead)</label><input type="number" min={1} max={365} value={form.max_advance_days} onChange={(x) => set("max_advance_days", +x.target.value)} className={input} /></div>
          <div className="sm:col-span-2">
            <label className={label}>Who attends</label>
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => set("mode", "any")} className={`rounded-full px-4 py-2 text-[12.5px] font-[560] ${form.mode === "any" ? "btn-gold" : "neu-chip"}`}>Any one (round-robin)</button>
              <button type="button" onClick={() => set("mode", "all")} className={`rounded-full px-4 py-2 text-[12.5px] font-[560] ${form.mode === "all" ? "btn-gold" : "neu-chip"}`}>All together (group)</button>
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Members</label>
            <div className="flex gap-2 flex-wrap">
              {members.length === 0 && <span className="text-[12.5px] text-faint">Add members first.</span>}
              {members.map((m) => <button key={m.id} type="button" onClick={() => toggleMember(m.id)} className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-[560] ${form.member_ids.includes(m.id) ? "btn-gold" : "neu-chip text-foreground/70"}`}>{m.name}</button>)}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Organizer / host <span className="text-faint font-normal">(creates the Meet link)</span></label>
            <select value={form.organizer_id} onChange={(x) => set("organizer_id", x.target.value)} className={input}>
              <option value="">Auto — first connected member</option>
              {form.member_ids.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2"><label className={label}>Description <span className="text-faint font-normal">(optional)</span></label><textarea value={form.description} onChange={(x) => set("description", x.target.value)} rows={2} className={input + " resize-none"} /></div>

          {/* custom intake questions */}
          <div className="sm:col-span-2">
            <label className={label}>Intake questions <span className="text-faint font-normal">(asked on the booking form)</span></label>
            <div className="grid gap-2">
              {form.questions.map((q, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={q.label} onChange={(x) => updQ(i, { label: x.target.value })} placeholder="Question label, e.g. Company" className={input} />
                  <label className="flex items-center gap-1 text-[12px] shrink-0"><input type="checkbox" checked={q.required} onChange={(x) => updQ(i, { required: x.target.checked })} className="accent-[#c8a24a]" />req</label>
                  <button type="button" onClick={() => delQ(i)} className="text-[#b3341f] text-[16px] px-1">×</button>
                </div>
              ))}
              <button type="button" onClick={addQ} className={btnNeu + " w-fit"}>+ add question</button>
            </div>
          </div>

          <div><label className={label}>Price ₹ <span className="text-faint font-normal">(0 = free)</span></label><input type="number" min={0} value={form.price_inr} onChange={(x) => set("price_inr", +x.target.value)} className={input} /></div>
          <div><label className={label}>Extra durations <span className="text-faint font-normal">(min, comma-sep)</span></label><input value={form.durationsText} onChange={(x) => set("durationsText", x.target.value)} placeholder="e.g. 15, 30, 60" className={input} /></div>

          <label className="sm:col-span-2 flex items-center gap-2 text-[13px] cursor-pointer"><input type="checkbox" checked={form.followup_enabled} onChange={(x) => set("followup_enabled", x.target.checked)} className="accent-[#c8a24a]" />Send an automatic thank-you email after the meeting</label>
          <label className="sm:col-span-2 flex items-center gap-2 text-[13px] cursor-pointer"><input type="checkbox" checked={form.requires_approval} onChange={(x) => set("requires_approval", x.target.checked)} className="accent-[#c8a24a]" />Require my approval before a booking is confirmed</label>

          <div className="sm:col-span-2 flex items-center gap-3"><button type="submit" disabled={busy} className={btnGold}>{busy ? "Creating…" : "Create meeting type"}</button>{e && <span className="text-[12.5px] text-[#b3341f]">{e}</span>}</div>
        </form>
      </div>
      <CouponsCard />
    </div>
  );
}

/* ─────────────── Coupons ─────────────── */
function CouponsCard() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [code, setCode] = useState(""); const [kind, setKind] = useState<"percent" | "flat">("percent"); const [value, setValue] = useState(10); const [maxUses, setMaxUses] = useState(0);
  const [e, setE] = useState("");
  const load = useCallback(async () => { try { setCoupons((await api("/api/meet/admin/coupons")).coupons); } catch (x) { setE(msg(x)); } }, []);
  useEffect(() => { load(); }, [load]);
  async function add(ev: React.FormEvent) { ev.preventDefault(); setE(""); try { await api("/api/meet/admin/coupons", "POST", { code, kind, value, max_uses: maxUses }); setCode(""); load(); } catch (x) { setE(msg(x)); } }
  async function del(c: string) { try { await api(`/api/meet/admin/coupons?code=${c}`, "DELETE"); load(); } catch (x) { alert(msg(x)); } }
  return (
    <div className={card}>
      <h3 className="font-serif text-[17px] font-[600] mb-1">Discount coupons</h3>
      <p className="text-[12.5px] text-muted-foreground mb-4">For paid meeting types. Clients enter the code at checkout.</p>
      <div className="flex gap-2 flex-wrap mb-4">
        {coupons.length === 0 && <span className="text-[12.5px] text-faint">No coupons yet.</span>}
        {coupons.map((c) => <span key={c.code} className={chip + " flex items-center gap-1.5"}>{c.code} · {c.kind === "percent" ? `${c.value}%` : `₹${c.value}`}{c.max_uses ? ` · ${c.uses}/${c.max_uses}` : ""}<button onClick={() => del(c.code)} className="text-[#b3341f] text-[14px]">×</button></span>)}
      </div>
      <form onSubmit={add} className="grid sm:grid-cols-4 gap-3">
        <input value={code} onChange={(x) => setCode(x.target.value.toUpperCase())} placeholder="CODE" className={input} />
        <select value={kind} onChange={(x) => setKind(x.target.value as "percent" | "flat")} className={input}><option value="percent">Percent %</option><option value="flat">Flat ₹</option></select>
        <input type="number" min={1} value={value} onChange={(x) => setValue(+x.target.value)} className={input} placeholder="Value" />
        <input type="number" min={0} value={maxUses} onChange={(x) => setMaxUses(+x.target.value)} className={input} placeholder="Max uses (0=∞)" />
        <div className="sm:col-span-4 flex items-center gap-3"><button type="submit" className={btnGold}>Add coupon</button>{e && <span className="text-[12.5px] text-[#b3341f]">{e}</span>}</div>
      </form>
    </div>
  );
}

/* ─────────────── Availability (multi-window + blackouts) ─────────────── */
type Win = { start: string; end: string };
function AvailabilityTab({ members }: { members: Member[] }) {
  const [memberId, setMemberId] = useState("");
  const [rows, setRows] = useState<Win[][]>(() => WD.map(() => []));
  const [blackouts, setBlackouts] = useState<string[]>([]);
  const [newDay, setNewDay] = useState("");
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState("");
  useEffect(() => { if (!memberId && members.length) setMemberId(members[0].id); }, [members, memberId]);

  const load = useCallback(async (id: string) => {
    if (!id) return; setStatus("");
    try {
      const [av, bl] = await Promise.all([api(`/api/meet/admin/availability?memberId=${id}`), api(`/api/meet/admin/blackouts?memberId=${id}`)]);
      const base: Win[][] = WD.map(() => []);
      for (const r of av.rules || []) base[r.weekday].push({ start: r.start, end: r.end });
      setRows(base); setBlackouts((bl.days || []).sort());
    } catch (e) { setStatus(msg(e)); }
  }, []);
  useEffect(() => { if (memberId) load(memberId); }, [memberId, load]);

  const addWin = (d: number) => setRows((rs) => rs.map((w, i) => i === d ? [...w, { start: "09:00", end: "17:00" }] : w));
  const updWin = (d: number, i: number, patch: Partial<Win>) => setRows((rs) => rs.map((w, wd) => wd === d ? w.map((x, xi) => xi === i ? { ...x, ...patch } : x) : w));
  const delWin = (d: number, i: number) => setRows((rs) => rs.map((w, wd) => wd === d ? w.filter((_, xi) => xi !== i) : w));

  async function save() {
    setBusy(true); setStatus("");
    try {
      const rules = rows.flatMap((wins, weekday) => wins.filter((w) => w.start < w.end).map((w) => ({ weekday, start: w.start, end: w.end })));
      await api("/api/meet/admin/availability", "POST", { memberId, rules });
      setStatus("Saved ✓"); setTimeout(() => setStatus(""), 1800);
    } catch (e) { setStatus(msg(e)); } finally { setBusy(false); }
  }
  async function addBlackout() { if (!/^\d{4}-\d{2}-\d{2}$/.test(newDay)) return; try { await api("/api/meet/admin/blackouts", "POST", { memberId, day: newDay }); setNewDay(""); load(memberId); } catch (e) { alert(msg(e)); } }
  async function delBlackout(day: string) { try { await api(`/api/meet/admin/blackouts?memberId=${memberId}&day=${day}`, "DELETE"); load(memberId); } catch (e) { alert(msg(e)); } }

  return (
    <div className="grid gap-5">
      <div className={card}>
        <h2 className="font-serif text-[19px] font-[600] mb-1">Weekly availability</h2>
        <p className="text-[12.5px] text-muted-foreground mb-4">Working hours per day (add multiple windows, e.g. 9–12 and 2–6). Slots appear only inside these hours and around Google-Calendar busy times.</p>
        <div className="mb-5 max-w-xs">
          <label className={label}>Member</label>
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className={input}>
            {members.length === 0 && <option value="">Add a member first</option>}
            {members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.timezone})</option>)}
          </select>
        </div>
        <div className="grid gap-2">
          {rows.map((wins, d) => (
            <div key={d} className="neu-inset rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="w-[46px] text-[13px] font-[560]">{WD[d]}</span>
                {wins.length === 0 && <span className="text-[12px] text-faint">Closed</span>}
                {wins.map((w, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <input type="time" value={w.start} onChange={(e) => updWin(d, i, { start: e.target.value })} className="neu-inset rounded-lg px-2 py-1 text-[12.5px]" />
                    <span className="text-faint text-[11px]">–</span>
                    <input type="time" value={w.end} onChange={(e) => updWin(d, i, { end: e.target.value })} className="neu-inset rounded-lg px-2 py-1 text-[12.5px]" />
                    <button onClick={() => delWin(d, i)} className="text-[#b3341f] text-[15px] px-1">×</button>
                  </span>
                ))}
                <button onClick={() => addWin(d)} className="text-gold text-[12px] font-semibold">+ window</button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-5"><button onClick={save} disabled={busy || !memberId} className={btnGold}>{busy ? "Saving…" : "Save availability"}</button>{status && <span className={`text-[12.5px] ${status.includes("✓") ? "text-[#2b7a4b]" : "text-[#b3341f]"}`}>{status}</span>}</div>
      </div>

      <div className={card}>
        <h3 className="font-serif text-[17px] font-[600] mb-1">Time off / blackout dates</h3>
        <p className="text-[12.5px] text-muted-foreground mb-4">No slots will be offered on these days.</p>
        <div className="flex items-center gap-2 mb-3">
          <input type="date" value={newDay} onChange={(e) => setNewDay(e.target.value)} className={input + " max-w-[200px]"} />
          <button onClick={addBlackout} className={btnNeu}>Add day off</button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {blackouts.length === 0 && <span className="text-[12.5px] text-faint">None set.</span>}
          {blackouts.map((day) => <span key={day} className={chip + " flex items-center gap-1.5"}>{day}<button onClick={() => delBlackout(day)} className="text-[#b3341f] text-[14px]">×</button></span>)}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── New meeting (manual) ─────────────── */
function NewMeetingCard({ members, reload, copy, copied }: { members: Member[]; reload: () => void; copy: (t: string, id: string) => void; copied: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(""); const [ids, setIds] = useState<string[]>([]); const [organizer, setOrganizer] = useState("");
  const [when, setWhen] = useState(""); const [dur, setDur] = useState(30);
  const [gName, setGName] = useState(""); const [gEmail, setGEmail] = useState(""); const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false); const [e, setE] = useState("");
  const [result, setResult] = useState<null | { meetLink: string | null; cancelToken: string; invited: boolean }>(null);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name || "—";
  const toggle = (id: string) => setIds((s) => { const has = s.includes(id); const next = has ? s.filter((x) => x !== id) : [...s, id]; if (has && organizer === id) setOrganizer(""); return next; });

  async function create(ev: React.FormEvent) {
    ev.preventDefault(); setBusy(true); setE(""); setResult(null);
    try {
      const startISO = when ? new Date(when).toISOString() : "";
      const d = await api("/api/meet/admin/create-meeting", "POST", { title, memberIds: ids, organizerId: organizer || undefined, startISO, durationMin: dur, clientName: gName, clientEmail: gEmail, notes });
      setResult({ meetLink: d.meetLink, cancelToken: d.cancelToken, invited: d.invited });
      setTitle(""); setWhen(""); setGName(""); setGEmail(""); setNotes(""); reload();
    } catch (x) { setE(msg(x)); } finally { setBusy(false); }
  }

  if (!open) return <div className={card}><div className="flex items-center justify-between"><div><h3 className="font-serif text-[17px] font-[600]">Create a meeting yourself</h3><p className="text-[12.5px] text-muted-foreground mt-0.5">Pick a time, get a Meet link, optionally email the guest.</p></div><button onClick={() => setOpen(true)} className={btnGold}>+ New meeting</button></div></div>;

  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-4"><h3 className="font-serif text-[17px] font-[600]">New meeting</h3><button onClick={() => { setOpen(false); setResult(null); }} className="text-faint text-[20px] leading-none">×</button></div>
      {result ? (
        <div className="neu-inset rounded-2xl p-4">
          <div className="text-[14px] font-[600] text-[#2b7a4b] mb-2">Meeting created ✓ {result.invited ? "· guest emailed" : ""}</div>
          {result.meetLink && <div className="flex items-center gap-2 mb-2"><input readOnly value={result.meetLink} className={input + " text-[12px]"} onFocus={(x) => x.currentTarget.select()} /><button onClick={() => copy(result.meetLink!, "nm-meet")} className={btnNeu + " shrink-0"}>{copied === "nm-meet" ? "Copied ✓" : "Copy Meet"}</button></div>}
          <div className="flex items-center gap-2"><input readOnly value={`${typeof window !== "undefined" ? window.location.origin : ""}/meet/reschedule?t=${result.cancelToken}`} className={input + " text-[11.5px] text-faint"} onFocus={(x) => x.currentTarget.select()} /><button onClick={() => copy(`${window.location.origin}/meet/reschedule?t=${result.cancelToken}`, "nm-res")} className={btnNeu + " shrink-0"}>{copied === "nm-res" ? "Copied ✓" : "Reschedule link"}</button></div>
          <button onClick={() => setResult(null)} className={btnGold + " mt-4"}>Create another</button>
        </div>
      ) : (
        <form onSubmit={create} className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label className={label}>Title</label><input value={title} onChange={(x) => setTitle(x.target.value)} placeholder="e.g. Project kickoff" className={input} required /></div>
          <div><label className={label}>Date &amp; time</label><input type="datetime-local" value={when} onChange={(x) => setWhen(x.target.value)} className={input} required /></div>
          <div><label className={label}>Duration (min)</label><input type="number" min={5} step={5} value={dur} onChange={(x) => setDur(+x.target.value)} className={input} /></div>
          <div className="sm:col-span-2"><label className={label}>Members</label><div className="flex gap-2 flex-wrap">{members.length === 0 && <span className="text-[12.5px] text-faint">Add members first.</span>}{members.map((m) => <button key={m.id} type="button" onClick={() => toggle(m.id)} className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-[560] ${ids.includes(m.id) ? "btn-gold" : "neu-chip text-foreground/70"}`}>{m.name}</button>)}</div></div>
          <div className="sm:col-span-2"><label className={label}>Organizer / host</label><select value={organizer} onChange={(x) => setOrganizer(x.target.value)} className={input}><option value="">Auto — first connected</option>{ids.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}</select></div>
          <div><label className={label}>Guest name <span className="text-faint font-normal">(optional)</span></label><input value={gName} onChange={(x) => setGName(x.target.value)} className={input} /></div>
          <div><label className={label}>Guest email <span className="text-faint font-normal">(to email invite)</span></label><input type="email" value={gEmail} onChange={(x) => setGEmail(x.target.value)} className={input} /></div>
          <div className="sm:col-span-2"><label className={label}>Notes <span className="text-faint font-normal">(optional)</span></label><textarea value={notes} onChange={(x) => setNotes(x.target.value)} rows={2} className={input + " resize-none"} /></div>
          <div className="sm:col-span-2 flex items-center gap-3"><button type="submit" disabled={busy} className={btnGold}>{busy ? "Creating…" : "Create meeting"}</button>{e && <span className="text-[12.5px] text-[#b3341f]">{e}</span>}</div>
        </form>
      )}
    </div>
  );
}

/* ─────────────── Bookings ─────────────── */
function BookingsTab({ bookings, reload, members, copy, copied }: { bookings: Booking[]; reload: () => void; members: Member[]; copy: (t: string, id: string) => void; copied: string }) {
  const now = Date.now();
  const upcoming = bookings.filter((b) => b.status !== "cancelled" && Date.parse(b.end_utc) >= now);
  const past = bookings.filter((b) => b.status === "cancelled" || Date.parse(b.end_utc) < now);
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  async function cancel(id: string) { if (!confirm("Cancel this booking? It's removed from calendars.")) return; try { await api("/api/meet/admin/bookings", "PATCH", { id, action: "cancel" }); reload(); } catch (e) { alert(msg(e)); } }
  async function attend(id: string, attendance: string) { try { await api("/api/meet/admin/bookings", "PATCH", { id, action: "attendance", attendance }); reload(); } catch (e) { alert(msg(e)); } }
  async function approve(id: string) { try { await api("/api/meet/admin/bookings", "PATCH", { id, action: "approve" }); reload(); } catch (e) { alert(msg(e)); } }

  const Row = (b: Booking, isPast: boolean) => (
    <div key={b.id} className="neu-inset rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[14px] font-[600] flex items-center gap-2 flex-wrap">{b.client_name}
            {b.status === "pending" && <span className={chip + " text-[#7a5c15]"}>Pending approval</span>}
            {b.status === "cancelled" && <span className={chip + " text-[#b3341f]"}>Cancelled</span>}
            {b.attendance === "no_show" && <span className={chip + " text-[#b3341f]"}>No-show</span>}
            {b.attendance === "attended" && <span className={chip + " text-[#2b7a4b]"}>Attended</span>}
          </div>
          <div className="text-[12.5px] text-muted-foreground">{b.meetingTypeName} · {b.memberNames.join(", ")}</div>
          <div className="text-[12px] text-faint mt-0.5">{fmt(b.start_utc)} · {b.client_email}</div>
          {b.answers && b.answers.length > 0 && <div className="text-[11.5px] text-muted-foreground mt-1">{b.answers.map((a) => `${a.q}: ${a.a}`).join(" · ")}</div>}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {b.status === "pending" && !isPast && <button onClick={() => approve(b.id)} className={btnGold + " !px-4 !py-1.5"}>Approve</button>}
          {b.meet_link && b.status !== "cancelled" && <a href={b.meet_link} target="_blank" rel="noopener noreferrer" className={btnNeu}>Meet</a>}
          {b.status !== "cancelled" && b.status !== "pending" && b.cancel_token && !isPast && <a href={`/meet/reschedule?t=${b.cancel_token}`} className={btnNeu}>Reschedule</a>}
          {b.status !== "cancelled" && !isPast && <button onClick={() => cancel(b.id)} className="text-[12px] font-semibold text-[#b3341f] hover:underline">{b.status === "pending" ? "Decline" : "Cancel"}</button>}
          {isPast && b.status !== "cancelled" && (
            <>
              <button onClick={() => attend(b.id, b.attendance === "attended" ? "" : "attended")} className={btnNeu}>{b.attendance === "attended" ? "✓ Attended" : "Attended"}</button>
              <button onClick={() => attend(b.id, b.attendance === "no_show" ? "" : "no_show")} className={btnNeu}>{b.attendance === "no_show" ? "✓ No-show" : "No-show"}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="grid gap-5">
      <NewMeetingCard members={members} reload={reload} copy={copy} copied={copied} />
      <div className={card}>
        <div className="flex items-center justify-between mb-4"><h2 className="font-serif text-[19px] font-[600]">Upcoming</h2><button onClick={reload} className={btnNeu}>Refresh</button></div>
        <div className="grid gap-3">{upcoming.length === 0 && <p className="text-[13px] text-muted-foreground">No upcoming bookings.</p>}{upcoming.map((b) => Row(b, false))}</div>
      </div>
      {past.length > 0 && <div className={card}><h2 className="font-serif text-[19px] font-[600] mb-4">Past &amp; cancelled</h2><div className="grid gap-3">{past.slice(0, 40).map((b) => Row(b, true))}</div></div>}
    </div>
  );
}

/* ─────────────── Analytics ─────────────── */
function AnalyticsTab() {
  const [a, setA] = useState<Analytics | null>(null); const [err, setErr] = useState("");
  useEffect(() => { (async () => { try { setA(await api("/api/meet/admin/analytics")); } catch (e) { setErr(msg(e)); } })(); }, []);
  if (err) return <div className={card}><p className="text-[13px] text-[#b3341f]">{err}</p></div>;
  if (!a) return <div className={card}><p className="text-[13px] text-muted-foreground">Loading…</p></div>;
  const maxHour = Math.max(1, ...a.byHour); const maxWd = Math.max(1, ...a.byWeekday); const maxWk = Math.max(1, ...a.perWeek.map((w) => w.count));
  const Stat = ({ n, l }: { n: number; l: string }) => <div className="neu-inset rounded-2xl px-4 py-3 text-center"><div className="font-serif text-[24px] font-[600] text-gold">{n}</div><div className="text-[11.5px] text-muted-foreground">{l}</div></div>;

  return (
    <div className="grid gap-5">
      <div className={card}>
        <h2 className="font-serif text-[19px] font-[600] mb-4">Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat n={a.confirmed} l="Confirmed" /><Stat n={a.thisWeek} l="This week" /><Stat n={a.cancelled} l="Cancelled" /><Stat n={a.noShow} l="No-shows" />
        </div>
      </div>
      <div className={card}>
        <h3 className="font-serif text-[17px] font-[600] mb-4">Bookings per week</h3>
        <div className="flex items-end gap-2 h-[120px]">
          {a.perWeek.length === 0 && <p className="text-[13px] text-muted-foreground">No data yet.</p>}
          {a.perWeek.map((w) => (
            <div key={w.week} className="flex-1 flex flex-col items-center justify-end gap-1">
              <div className="w-full rounded-t-md bg-gradient-to-t from-[#c8a24a] to-[#e7d6ac]" style={{ height: `${(w.count / maxWk) * 100}%` }} title={`${w.count}`} />
              <div className="text-[10px] text-faint">{w.week.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-5">
        <div className={card}>
          <h3 className="font-serif text-[17px] font-[600] mb-4">Popular days</h3>
          <div className="grid gap-1.5">
            {a.byWeekday.map((c, i) => <div key={i} className="flex items-center gap-2"><span className="w-[34px] text-[11.5px] text-faint">{WD[i]}</span><div className="flex-1 h-[14px] rounded-full neu-inset overflow-hidden"><div className="h-full bg-gold/70" style={{ width: `${(c / maxWd) * 100}%` }} /></div><span className="w-[22px] text-right text-[11.5px]">{c}</span></div>)}
          </div>
        </div>
        <div className={card}>
          <h3 className="font-serif text-[17px] font-[600] mb-4">Popular times</h3>
          <div className="flex items-end gap-[2px] h-[110px]">
            {a.byHour.map((c, h) => <div key={h} className="flex-1 rounded-t-sm bg-gold/60" style={{ height: `${(c / maxHour) * 100}%` }} title={`${h}:00 — ${c}`} />)}
          </div>
          <div className="flex justify-between text-[10px] text-faint mt-1"><span>0h</span><span>12h</span><span>23h</span></div>
        </div>
      </div>
      {a.byType.length > 0 && (
        <div className={card}>
          <h3 className="font-serif text-[17px] font-[600] mb-4">By meeting type</h3>
          <div className="grid gap-2">{a.byType.map((t) => <div key={t.name} className="flex items-center justify-between text-[13px]"><span>{t.name}</span><span className={chip}>{t.count}</span></div>)}</div>
        </div>
      )}
    </div>
  );
}

/* ─────────────── Team Calendar (one calendar for everyone) ─────────────── */
const CAL_COLORS = ["#c8a24a", "#5b8a72", "#8a5b7a", "#5b6f8a", "#a86b4a", "#6b8a5b", "#7a5b8a", "#8a7a4a"];
const CAL_TZ = "Asia/Kolkata"; // render the whole calendar in one fixed zone, not the viewer's browser
function mondayOf(d: Date) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
// ── everything below reads the time in CAL_TZ, so it's correct regardless of the viewer's timezone ──
const istKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: CAL_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const istHM = (d: Date) => { const p = new Intl.DateTimeFormat("en-GB", { timeZone: CAL_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d); return (+(p.find((x) => x.type === "hour")?.value || 0)) + (+(p.find((x) => x.type === "minute")?.value || 0)) / 60; };
const istWeekday = (d: Date) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(new Intl.DateTimeFormat("en-US", { timeZone: CAL_TZ, weekday: "short" }).format(d));
function isToday(d: Date) { return istKey(d) === istKey(new Date()); }

function TeamCalendar({ bookings, members, reload, refreshTick }: { bookings: Booking[]; members: Member[]; reload: () => void; refreshTick?: number }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [mf, setMf] = useState("");
  const [avail, setAvail] = useState<{ weekday: number; start: string; end: string }[]>([]);
  const [busy, setBusy] = useState<{ memberId: string; name: string; intervals: { start: string; end: string; title?: string }[] }[]>([]);
  const [loadingBusy, setLoadingBusy] = useState(false);
  useEffect(() => { if (mf) fetch(`/api/meet/admin/availability?memberId=${mf}`).then((r) => r.json()).then((d) => setAvail(d.rules || [])).catch(() => setAvail([])); else setAvail([]); }, [mf, refreshTick]);
  // Pull each member's REAL calendar events (Google + Zoho) for a given week.
  const fetchBusy = useCallback(async (ws: Date) => {
    setLoadingBusy(true);
    const from = ws.toISOString(), to = new Date(ws.getTime() + 7 * 864e5).toISOString();
    try { const d = await (await fetch(`/api/meet/admin/calendar-busy?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)).json(); setBusy(d.busy || []); }
    catch { setBusy([]); } finally { setLoadingBusy(false); }
  }, []);
  useEffect(() => { fetchBusy(weekStart); }, [weekStart, fetchBusy, refreshTick]);
  const goToday = () => { const m = mondayOf(new Date()); setWeekStart(m); fetchBusy(m); };
  const refreshAll = () => { reload(); fetchBusy(weekStart); if (mf) fetch(`/api/meet/admin/availability?memberId=${mf}`).then((r) => r.json()).then((d) => setAvail(d.rules || [])).catch(() => {}); };
  const colorOf = (id: string) => CAL_COLORS[Math.max(0, members.findIndex((m) => m.id === id)) % CAL_COLORS.length];
  const HS = 7, HE = 21, RH = 46;
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const active = bookings.filter((b) => b.status !== "cancelled" && (!mf || b.member_ids.includes(mf)));
  const busyFor = mf ? busy.filter((b) => b.memberId === mf) : busy;
  const fmtT = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: CAL_TZ, hour: "numeric", minute: "2-digit" });
  const sameDay = (iso: string, day: Date) => istKey(new Date(iso)) === istKey(day);
  const fmtDay = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", { timeZone: CAL_TZ, ...o });
  const weekLabel = `${fmtDay(weekStart, { month: "short", day: "numeric" })} – ${fmtDay(addDays(weekStart, 6), { month: "short", day: "numeric" })}`;

  return (
    <div className={card + " overflow-hidden"}>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className={btnNeu}>‹</button>
          <span className="text-[14px] font-[600] min-w-[150px] text-center">{weekLabel}</span>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className={btnNeu}>›</button>
          <button onClick={goToday} className={btnNeu}>Today</button>
        </div>
        <div className="flex items-center gap-2">
          <select value={mf} onChange={(e) => setMf(e.target.value)} className={input + " max-w-[190px] text-[12.5px]"}>
            <option value="">All members</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button onClick={refreshAll} disabled={loadingBusy} className={btnNeu + " disabled:opacity-60"}>{loadingBusy ? "…" : "Refresh"}</button>
        </div>
      </div>
      <div className="flex gap-3 flex-wrap mb-3">{members.map((m) => <span key={m.id} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full" style={{ background: colorOf(m.id) }} />{m.name}</span>)}{mf && <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><span className="w-2.5 h-2.5 rounded bg-[#5b8a72]/30" />available</span>}<span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><span className="w-2.5 h-2.5 rounded bg-foreground/10 border border-foreground/15" />busy (their calendar)</span></div>
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid" style={{ gridTemplateColumns: `48px repeat(7,1fr)` }}>
            <div />
            {days.map((d, i) => <div key={i} className="text-center pb-2"><div className="text-[11px] text-faint">{fmtDay(d, { weekday: "short" })}</div><div className={"text-[13px] font-[600] " + (isToday(d) ? "text-gold" : "")}>{fmtDay(d, { day: "numeric" })}</div></div>)}
          </div>
          <div className="grid" style={{ gridTemplateColumns: `48px repeat(7,1fr)` }}>
            <div>{Array.from({ length: HE - HS }, (_, h) => <div key={h} style={{ height: RH }} className="text-[10px] text-faint text-right pr-1.5 -mt-1.5">{HS + h}:00</div>)}</div>
            {days.map((day, di) => (
              <div key={di} className="relative border-l border-border" style={{ height: (HE - HS) * RH }}>
                {Array.from({ length: HE - HS }, (_, h) => <div key={h} style={{ top: h * RH, height: RH }} className="absolute inset-x-0 border-b border-border/40" />)}
                {mf && avail.filter((a) => a.weekday === istWeekday(day)).map((a, ai) => {
                  const [sh, sm] = a.start.split(":").map(Number), [eh, em] = a.end.split(":").map(Number);
                  const top = ((sh + sm / 60) - HS) * RH, ht = ((eh + em / 60) - (sh + sm / 60)) * RH;
                  return <div key={ai} className="absolute inset-x-0.5 rounded bg-[#5b8a72]/12" style={{ top, height: ht }} />;
                })}
                {busyFor.flatMap((bm) => bm.intervals.filter((iv) => sameDay(iv.start, day)).map((iv, ii) => {
                  const top = (istHM(new Date(iv.start)) - HS) * RH;
                  const dur = (Date.parse(iv.end) - Date.parse(iv.start)) / 6e4; const ht = Math.max(18, dur / 60 * RH);
                  return <div key={bm.memberId + ii} className="absolute inset-x-0.5 rounded bg-foreground/[0.09] border border-foreground/10 overflow-hidden" style={{ top, height: ht }} title={`${iv.title || "Busy"} · ${bm.name} · ${new Date(iv.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}>
                    <div className="text-[9px] text-foreground/60 px-1 leading-tight truncate font-[560]">{iv.title || "Busy"}</div>
                    {!mf && <div className="text-[8px] text-foreground/40 px-1 leading-tight truncate">{bm.name.split(" ")[0]}</div>}
                  </div>;
                }))}
                {active.filter((b) => sameDay(b.start_utc, day)).map((b) => {
                  const top = (istHM(new Date(b.start_utc)) - HS) * RH;
                  const dur = (Date.parse(b.end_utc) - Date.parse(b.start_utc)) / 6e4; const ht = Math.max(24, dur / 60 * RH);
                  return <div key={b.id} className="absolute inset-x-0.5 rounded-md px-1.5 py-0.5 overflow-hidden text-white shadow-sm" style={{ top, height: ht, background: colorOf(b.member_ids[0] || ""), opacity: b.status === "pending" ? 0.6 : 1 }} title={`${fmtT(b.start_utc)} · ${b.client_name} · ${b.meetingTypeName} · ${b.memberNames.join(", ")}${b.status === "pending" ? " (pending)" : ""}`}>
                    <div className="text-[10px] font-[600] leading-tight truncate">{fmtT(b.start_utc)} {b.client_name}</div>
                    <div className="text-[9px] leading-tight truncate opacity-90">{b.memberNames.join(", ")}</div>
                  </div>;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {active.length === 0 && <p className="text-[12.5px] text-faint text-center mt-3">No bookings this week{mf ? " for this member" : ""}.</p>}
      <p className="text-[11px] text-faint mt-3">Shows Avloryn bookings <b>and</b> each member&rsquo;s real Google/Zoho calendar events (grey = busy). Pick a member to see their working hours too.</p>
    </div>
  );
}
