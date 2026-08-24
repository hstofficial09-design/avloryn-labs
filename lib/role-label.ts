/**
 * What to call somebody, in one place.
 *
 * This label was hand-written in seven different files — the profile page, the hub, the employee
 * dashboard twice, the owner's tables three times — each one its own little chain of ternaries.
 * When network partners arrived, exactly one of those seven learned about them; everywhere else a
 * Campus Ambassador was quietly shown as "Employee". That is what duplicated logic does: the fix
 * lands where you happened to look, and the other six keep telling people the wrong thing.
 *
 * So it lives here, once. Adding a kind of person is now a change to this function, not a hunt.
 */
/** "consultant" → "Consultant", "part_time_writer" → "Part Time Writer". */
function prettify(key: string): string {
  return key.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ")
    .split(" ").filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export type RoleLike = {
  emp_type?: string | null;
  /** Network partners: their kind — Campus Ambassador, Influencer, Thesis Writing Agency. */
  role?: string | null;
  /** Staff: which track they sit on — Business Development, Marketing & Community… */
  track?: string | null;
};

export function isPartnerRole(e: RoleLike | null | undefined): boolean {
  return (e?.emp_type || "") === "partner";
}

/**
 * `withTrack` off gives the short form ("Intern") for places too tight for the track.
 * A partner always shows their actual kind when we know it — "Campus Ambassador" is what they
 * call themselves, and "Network Partner" is only the fallback when nothing was recorded.
 */
export function roleLabel(e: RoleLike | null | undefined, opts: { isOwner?: boolean; withTrack?: boolean } = {}): string {
  const { isOwner = false, withTrack = true } = opts;
  if (isOwner) return "Owner";
  if (isPartnerRole(e)) return (e?.role || "").trim() || "Network Partner";
  const kind = (e?.emp_type || "").trim();
  if (kind === "intern") {
    const track = (e?.track || "").trim();
    return withTrack && track ? `Intern · ${track}` : "Intern";
  }
  if (!kind || kind === "employee") return "Employee";
  // The owner can add kinds of their own (Consultant, Freelancer, Volunteer). This runs on the
  // client with no database, and a kind can be archived while people still hold it, so the label
  // is derived from the key rather than looked up — an unknown kind must never render as blank,
  // as "undefined", or worst of all as the wrong word.
  return prettify(kind);
}
