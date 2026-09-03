"use client";

/**
 * The team birthday board.
 *
 * Shown to everybody who can sign in, because that is the point of it — a reminder is no use only
 * to the person who already knows. Names and dates only: no year, so nobody's age goes on a shared
 * screen, and no other personal detail travels with it.
 */
export type BirthdayRow = { name: string; days: number; label: string; date: string; kind?: string | null };

/** First name, for the greeting line. Falls back to the whole name when there is only one word. */
const first = (n: string) => n.trim().split(/\s+/)[0] || n;

export default function Birthdays({ rows, missing }: { rows: BirthdayRow[]; missing?: number }) {
  // Nothing recorded yet → no empty card taking up the top of everybody's dashboard, unless the
  // owner needs telling that there is nothing to show because nobody's date is on file.
  if (!rows?.length && !missing) return null;

  const todays = rows.filter((r) => r.days === 0);
  // Whoever is next, however far away. A cut-off at a month sounded tidier and meant the board sat
  // empty for most of the year, which is not a reminder — it is a blank space.
  const upcoming = rows.filter((r) => r.days > 0);

  return (
    <section className="card-lux rounded-[22px] p-5 sm:p-6 mb-7" aria-label="Team birthdays">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <div className="section-label">Team birthdays</div>
        {!todays.length && !!upcoming.length && (
          <div className="text-[11.5px] text-faint">Coming up</div>
        )}
      </div>

      {todays.map((r) => (
        <div key={r.name} className="rounded-2xl px-4 py-3.5 mb-2.5 flex items-center gap-3"
             style={{ background: "rgba(203,177,118,0.14)", boxShadow: "inset 0 0 0 1px rgba(174,140,74,0.35)" }}>
          <span aria-hidden className="text-[22px] leading-none">🎂</span>
          <div className="min-w-0">
            <div className="font-[620] text-[14.5px]" style={{ color: "#8a6d33" }}>
              It&rsquo;s {r.name}&rsquo;s birthday today
            </div>
            <div className="text-[12.5px] text-faint mt-0.5">Drop {first(r.name)} a message and wish them.</div>
          </div>
        </div>
      ))}

      {!!upcoming.length && (
        <ul className={todays.length ? "mt-1" : ""}>
          {upcoming.map((r) => (
            <li key={r.name + r.date} className="flex items-center justify-between gap-3 py-2 border-t border-border first:border-t-0">
              <span className="text-[13.5px] text-foreground truncate">{r.name}</span>
              {/* The label already carries the day and month; printing the date again beside it
                  read as "Thu, 8 Oct · 8 October". */}
              <span className="text-[12.5px] shrink-0 tabular-nums" style={{ color: r.days <= 1 ? "#8a6d33" : undefined }}>
                <span className={r.days <= 1 ? "font-[620]" : "text-faint"}>{r.label}</span>
                {r.days > 1 && <span className="text-faint"> · in {r.days} days</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Owner only: an empty or thin board is usually a collection problem, not a bug. A count,
          never the names. */}
      {!!missing && (
        <div className="text-[11.5px] text-faint mt-2.5 pt-2.5 border-t border-border">
          {missing} {missing === 1 ? "person has" : "people have"} no date of birth on file{rows.length ? "" : " — nothing to show yet"}.
        </div>
      )}
    </section>
  );
}
