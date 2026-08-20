import { NextResponse } from "next/server";
import { canSchedule, schedulingScope, canManageTeam } from "@/lib/booking/admin";
import { listMembers, addMember, updateMember, deleteMember, membersWithGoogle, getGoogle, membersWithZoho, getZoho, setAvailability } from "@/lib/booking/db";
import { signMemberToken } from "@/lib/booking/link";
import { googleConfigured, verifyMemberGoogle } from "@/lib/booking/google";
import { zohoConfigured, verifyMemberZoho } from "@/lib/booking/zoho";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deny = () => NextResponse.json({ error: "Not authorized" }, { status: 401 });

// Sensible starting hours so a new member is instantly bookable (Mon–Fri 10:00–19:00).
// The owner can change these any time in Availability.
const DEFAULT_HOURS = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "10:00", end: "19:00" }));

export async function GET() {
  const scope = await schedulingScope();
  if (!scope.ok) return deny();
  const members = await listMembers();
  const ids = members.map((m) => m.id);
  const [gConnected, zConnected] = await Promise.all([membersWithGoogle(ids), membersWithZoho(ids)]);
  const rows = await Promise.all(
    members.map(async (m) => {
      const [g, z] = await Promise.all([
        gConnected.has(m.id) ? getGoogle(m.id) : Promise.resolve(null),
        zConnected.has(m.id) ? getZoho(m.id) : Promise.resolve(null),
      ]);
      // A connect link is a signed token that binds a Google/Zoho account to THIS member.
      // Handing every colleague everyone's link would let one person attach their own
      // calendar in someone else's place, so only the owner and the member get it.
      const mine = scope.owner || m.id === scope.memberId;
      const token = mine ? signMemberToken(m.id) : "";
      // Verify rather than assume: a stored token can be revoked without us knowing.
      // Verify rather than assume: a stored token can be revoked without us knowing. One check
      // each — getAccessToken()/zohoAccess() reuse a still-valid token and only hit the network
      // when a real refresh is due.
      const [googleWorks, zohoWorks] = await Promise.all([
        g ? verifyMemberGoogle(m.id) : Promise.resolve(false),
        z ? verifyMemberZoho(m.id) : Promise.resolve(false),
      ]);
      return {
        ...m,
        googleConnected: googleWorks,
        // Tokens on file but the grant no longer works → needs reconnecting, not first-time setup.
        googleNeedsReconnect: !!g && !googleWorks,
        googleEmail: g?.google_email || null,
        zohoConnected: zohoWorks,
        zohoNeedsReconnect: !!z && !zohoWorks,
        zohoEmail: z?.zoho_email || null,
        // Signed links the owner shares so the member connects their own calendar(s).
        connectLink: mine ? `/api/meet/google/connect?t=${token}` : null,
        zohoConnectLink: mine ? `/api/meet/zoho/connect?t=${token}` : null,
      };
    })
  );
  // Tells the page whether to offer the team-management controls at all. The server enforces it
  // regardless; this is so people aren't shown buttons that would only refuse them.
  return NextResponse.json({
    members: rows, googleConfigured: googleConfigured(), zohoConfigured: zohoConfigured(),
    canManage: await canManageTeam(),
  });
}

export async function POST(req: Request) {
  if (!(await canManageTeam())) return deny();
  const d = await req.json().catch(() => ({}));
  const name = String(d.name || "").trim();
  const email = String(d.email || "").trim();
  if (!name || !email) return NextResponse.json({ error: "Name and email required" }, { status: 400 });
  const m = await addMember({
    name, email,
    timezone: String(d.timezone || "Asia/Kolkata"),
    is_organizer: !!d.is_organizer,
  });
  // Seed default working hours so the member is bookable immediately (no "no slots" surprise).
  try { await setAvailability(m.id, DEFAULT_HOURS); } catch { /* best-effort */ }
  return NextResponse.json({ member: m });
}

export async function PATCH(req: Request) {
  if (!(await canManageTeam())) return deny();
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
  if (!(await canManageTeam())) return deny();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteMember(id);
  return NextResponse.json({ ok: true });
}
