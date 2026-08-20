import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import {
  listTasks, listAllTasks, addTask, updateTask, deleteTask, markTaskDone, markTaskDelivered, giveTaskTo,
  listReviews, workStats, tenureScore, weekStartIST, getEmployeeProfile, listEmployeesWithSummary,
  REVIEW_CRITERIA,
} from "@/lib/portal-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The work log.
 *
 * Both sides write here, and who you are decides what you may do:
 *   owner    — assign a task to anyone, tick it delivered, edit or remove any task
 *   employee — add and manage their OWN tasks, and say when they've finished one
 *
 * An employee can never tick "delivered" (that is the owner accepting the work) and can never
 * touch another person's row — every write is scoped to their own employee id, taken from the
 * session rather than the request body.
 */
async function who() {
  const s = await getSession();
  if (!s) return null;
  if (s.role === "owner") return { owner: true as const, id: "", email: s.email };
  const p = await getEmployeeProfile(s.email);
  if (!p?.id) return null;
  return { owner: false as const, id: String(p.id), email: s.email };
}

export async function GET(req: Request) {
  const w = await who();
  if (!w) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;

  try {
    if (w.owner) {
      // One person's full log, or the whole company's stream.
      const empId = (sp.get("employeeId") || "").trim();
      if (empId) {
        const [tasks, reviews] = await Promise.all([listTasks(empId), listReviews(empId)]);
        return NextResponse.json({
          owner: true, employeeId: empId, tasks, reviews,
          stats: workStats(tasks), tenure: tenureScore(reviews, tasks),
          criteria: REVIEW_CRITERIA, thisWeek: weekStartIST(),
        });
      }
      const [all, team] = await Promise.all([listAllTasks(), listEmployeesWithSummary()]);
      return NextResponse.json({ owner: true, tasks: all, team, criteria: REVIEW_CRITERIA, thisWeek: weekStartIST() });
    }

    // An employee sees their own log and their own review history — nobody else's.
    const [tasks, reviews] = await Promise.all([listTasks(w.id), listReviews(w.id)]);
    return NextResponse.json({
      owner: false, tasks, reviews,
      stats: workStats(tasks), tenure: tenureScore(reviews, tasks),
      criteria: REVIEW_CRITERIA,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load the work log" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const w = await who();
  if (!w) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const d = await req.json().catch(() => ({} as any));
  const action = String(d.action || "");

  try {
    switch (action) {
      case "add": {
        // The owner may write it against anyone; everyone else only against themselves.
        const employeeId = w.owner ? String(d.employeeId || "").trim() : w.id;
        if (!employeeId) return NextResponse.json({ error: "Pick who this task is for" }, { status: 400 });
        const task = await addTask({
          employeeId, title: String(d.title || ""), detail: String(d.detail || ""),
          dueAt: d.dueAt ? String(d.dueAt) : null,
          source: w.owner ? "owner" : "self",
        });
        return NextResponse.json({ ok: true, task });
      }

      case "done": {
        // "I've finished this" — a claim, not acceptance. The owner can set it too (e.g. on
        // someone's behalf) but it still isn't what marks a task delivered.
        const id = String(d.id || "");
        if (!id) return NextResponse.json({ error: "Which task?" }, { status: 400 });
        if (w.owner) {
          const empId = String(d.employeeId || "").trim();
          if (!empId) return NextResponse.json({ error: "Which person?" }, { status: 400 });
          await markTaskDone(id, empId, !!d.done);
        } else {
          await markTaskDone(id, w.id, !!d.done);
        }
        return NextResponse.json({ ok: true });
      }

      case "delivered": {
        // Owner only, on purpose: this is the timestamp that decides on-time vs late.
        if (!w.owner) return NextResponse.json({ error: "Only the owner marks a task delivered" }, { status: 403 });
        const id = String(d.id || "");
        if (!id) return NextResponse.json({ error: "Which task?" }, { status: 400 });
        await markTaskDelivered(id, !!d.delivered);
        return NextResponse.json({ ok: true });
      }

      case "update": {
        const id = String(d.id || "");
        if (!id) return NextResponse.json({ error: "Which task?" }, { status: 400 });
        if (!w.owner) {
          // Scope the edit to their own row. Without this, any id in the body would do.
          const mine = (await listTasks(w.id)).some((t) => t.id === id);
          if (!mine) return NextResponse.json({ error: "That isn't your task" }, { status: 403 });
        }
        await updateTask(id, {
          ...(d.title !== undefined ? { title: String(d.title) } : {}),
          ...(d.detail !== undefined ? { detail: String(d.detail) } : {}),
          ...(d.dueAt !== undefined ? { dueAt: d.dueAt ? String(d.dueAt) : null } : {}),
        });
        return NextResponse.json({ ok: true });
      }

      case "give": {
        // Owner only: handing work to someone else is an assignment decision.
        if (!w.owner) return NextResponse.json({ error: "Only the owner can reassign a task" }, { status: 403 });
        const id = String(d.id || ""), to = String(d.toEmployeeId || "").trim();
        if (!id || !to) return NextResponse.json({ error: "Which task, and to whom?" }, { status: 400 });
        const task = await giveTaskTo(id, to, !!d.copy);
        if (!task) return NextResponse.json({ error: "That task no longer exists" }, { status: 404 });
        return NextResponse.json({ ok: true, task });
      }

      case "delete": {
        const id = String(d.id || "");
        if (!id) return NextResponse.json({ error: "Which task?" }, { status: 400 });
        await deleteTask(id, w.owner ? undefined : w.id);
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not save" }, { status: 500 });
  }
}
