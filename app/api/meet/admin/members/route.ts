import { NextResponse } from "next/server";
import { canSchedule } from "@/lib/booking/admin";
import { listMembers, addMember, updateMember, deleteMember, membersWithGoogle, getGoogle, membersWithZoho, getZoho } from "@/lib/booking/db";
import { signMemberToken } from "@/lib/booking/link";
import { googleConfigured } from "@/lib/booking/google";
import { zohoConfigured } from "@/lib/booking/zoho";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deny = () => NextResponse.json({ error: "Not authorized" }, { status: 401 });

export async function GET() {
  if (!(await canSchedule())) return deny();
  const members = await listMembers();
  const ids = members.map((m) => m.id);
  const [gConnected, zConnected] = await Promise.all([membersWithGoogle(ids), membersWithZoho(ids)]);
  const rows = await Promise.all(
    members.map(async (m) => {
      const g = gConnected.has(m.id) ? await getGoogle(m.id) : null;
      const z = zConnected.has(m.id) ? await getZoho(m.id) : null;
      const token = signMemberToken(m.id);
      return {
        ...m,
        googleConnected: !!g,
        googleEmail: g?.google_email || null,
        zohoConnected: !!z,
        zohoEmail: z?.zoho_email || null,
        // Signed links the owner shares so the member connects their own calendar(s).
        connectLink: `/api/meet/google/connect?t=${token}`,
        zohoConnectLink: `/api/meet/zoho/connect?t=${token}`,
      };
    })
  );
  return NextResponse.json({ members: rows, googleConfigured: googleConfigured(), zohoConfigured: zohoConfigured() });
}

export async function POST(req: Request) {
  if (!(await canSchedule())) return deny();
  const d = await req.json().catch(() => ({}));
  const name = String(d.name || "").trim();
  const email = String(d.email || "").trim();
  if (!name || !email) return NextResponse.json({ error: "Name and email required" }, { status: 400 });
  const m = await addMember({
    name, email,
    timezone: String(d.timezone || "Asia/Kolkata"),
    is_organizer: !!d.is_organizer,
  });
  return NextResponse.json({ member: m });
}

export async function PATCH(req: Request) {
  if (!(await canSchedule())) return deny();
  const d = await req.json().catch(() => ({}));
  const id = String(d.id || "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "email", "timezone", "active", "is_organizer"]) {
    if (k in d) patch[k] = d[k];
  }
  const m = await updateMember(id, patch);
  return NextResponse.json({ member: m });
}

export async function DELETE(req: Request) {
  if (!(await canSchedule())) return deny();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteMember(id);
  return NextResponse.json({ ok: true });
}
