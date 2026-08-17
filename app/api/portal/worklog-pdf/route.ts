import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSession } from "@/lib/portal-auth";
import {
  listTasks, listReviews, tenureScore, getEmployeeProfile, getEmployeeById,
} from "@/lib/portal-db";
import { taskLogPdf, performanceReportPdf } from "@/lib/worklog-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Downloads.
 *
 *   ?kind=log     — the factual task log. Yours, or (owner) anyone's.
 *   ?kind=report  — the signed performance report. OWNER ONLY.
 *
 * The report carries the founder's signature and the assessment scores, so its subject cannot
 * mint one for themselves; the owner issues it. The log has no scores and no signature, so
 * everyone can take their own record with them whenever they like.
 */
export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const kind = sp.get("kind") === "report" ? "report" : "log";
  const owner = s.role === "owner";

  try {
    // Whose log? An employee's is always their own, whatever the query string says.
    let person: any = null;
    if (owner) {
      const id = (sp.get("employeeId") || "").trim();
      if (!id) return NextResponse.json({ error: "employeeId required" }, { status: 400 });
      person = await getEmployeeById(id);
    } else {
      if (kind === "report") {
        return NextResponse.json(
          { error: "A performance report is issued by the founder. Ask for it — you can download your task log here." },
          { status: 403 });
      }
      person = await getEmployeeProfile(s.email);
    }
    if (!person?.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [tasks, reviews] = await Promise.all([listTasks(person.id), listReviews(person.id)]);
    const safeName = String(person.name || "record").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");

    let bytes: Uint8Array, filename: string;
    if (kind === "report") {
      // A short, stable id so a printed copy can be tied back to this person and issue date.
      const reportId = "AVL-" + createHash("sha256")
        .update(`${person.id}|${new Date().toISOString().slice(0, 10)}`)
        .digest("hex").slice(0, 8).toUpperCase();
      bytes = await performanceReportPdf(person, tasks, reviews, tenureScore(reviews, tasks), { reportId });
      filename = `${safeName}_Performance_Report.pdf`;
    } else {
      bytes = await taskLogPdf(person, tasks);
      filename = `${safeName}_Work_Log.pdf`;
    }

    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not build the document" }, { status: 500 });
  }
}
