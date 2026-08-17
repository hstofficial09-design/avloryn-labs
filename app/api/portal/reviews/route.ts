import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import {
  saveReview, deleteReview, listReviews, listTasks, tasksInWeek, workStats, tenureScore,
  weekStartIST, REVIEW_CRITERIA,
} from "@/lib/portal-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Weekly reviews. Written by the owner only — a self-scored appraisal is not an appraisal.
 * People can READ their own reviews (via /api/portal/tasks), which is the point of doing them.
 */
async function owner() {
  const s = await getSession();
  return !!s && s.role === "owner";
}

/** The week's task record, so a score is set against what actually happened, not a memory of it. */
export async function GET(req: Request) {
  if (!(await owner())) return NextResponse.json({ error: "Owner only" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const employeeId = (sp.get("employeeId") || "").trim();
  const week = (sp.get("week") || weekStartIST()).slice(0, 10);
  if (!employeeId) return NextResponse.json({ error: "employeeId required" }, { status: 400 });

  try {
    const [tasks, reviews] = await Promise.all([listTasks(employeeId), listReviews(employeeId)]);
    const weekTasks = tasksInWeek(tasks, week);
    return NextResponse.json({
      week, criteria: REVIEW_CRITERIA,
      existing: reviews.find((r) => r.week_start === week) || null,
      weekTasks, weekStats: workStats(weekTasks),
      tenure: tenureScore(reviews, tasks),
      reviews,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load the review" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await owner())) return NextResponse.json({ error: "Owner only" }, { status: 403 });
  const d = await req.json().catch(() => ({} as any));

  try {
    if (d.action === "delete") {
      if (!d.id) return NextResponse.json({ error: "Which review?" }, { status: 400 });
      await deleteReview(String(d.id));
      return NextResponse.json({ ok: true });
    }
    const employeeId = String(d.employeeId || "").trim();
    if (!employeeId) return NextResponse.json({ error: "employeeId required" }, { status: 400 });
    const review = await saveReview({
      employeeId,
      weekStart: String(d.week || weekStartIST()).slice(0, 10),
      scores: (d.scores && typeof d.scores === "object") ? d.scores : {},
      metrics: Array.isArray(d.metrics) ? d.metrics : [],
      note: String(d.note || ""),
    });
    const [tasks, reviews] = await Promise.all([listTasks(employeeId), listReviews(employeeId)]);
    return NextResponse.json({ ok: true, review, tenure: tenureScore(reviews, tasks) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not save the review" }, { status: 500 });
  }
}
