import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import { listOpenings, upsertOpening, setOpeningStatus, deleteOpening, duplicateOpening } from "@/lib/portal-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deny = () => NextResponse.json({ error: "Not authorized" }, { status: 401 });

// Hiring is the owner's call, so this whole console is owner-only — unlike Scheduling,
// which the team shares.
async function owner() {
  const s = await getSession();
  return !!s && s.role === "owner";
}

const DESC_MAX = 20000;
const STATUSES = ["draft", "open", "closed"] as const;

export async function GET() {
  if (!(await owner())) return deny();
  return NextResponse.json({ openings: await listOpenings() });
}

export async function POST(req: Request) {
  if (!(await owner())) return deny();
  const d = await req.json().catch(() => ({}));

  try {
    if (d.action === "save") {
      const o = d.opening || {};
      const title = String(o.title || "").trim();
      if (!title) return NextResponse.json({ error: "Give the role a title" }, { status: 400 });
      const desc = String(o.description || "");
      if (desc.length > DESC_MAX) {
        return NextResponse.json(
          { error: `The description is too long (${desc.length.toLocaleString()} characters, limit ${DESC_MAX.toLocaleString()}).` },
          { status: 400 },
        );
      }
      const status = STATUSES.includes(o.status) ? o.status : "draft";
      const saved = await upsertOpening({ ...o, title, description: desc, status });
      return NextResponse.json({ ok: true, ...saved });
    }

    if (d.action === "status") {
      const id = String(d.id || "");
      if (!id || !STATUSES.includes(d.status)) return NextResponse.json({ error: "id and a valid status are required" }, { status: 400 });
      await setOpeningStatus(id, d.status);
      return NextResponse.json({ ok: true });
    }

    if (d.action === "duplicate") {
      const id = String(d.id || "");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      return NextResponse.json({ ok: true, ...(await duplicateOpening(id)) });
    }

    if (d.action === "delete") {
      const id = String(d.id || "");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      await deleteOpening(id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not save" }, { status: 500 });
  }
}
