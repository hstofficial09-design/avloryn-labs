"use client";
import React, { useState } from "react";

export type TreeNode = {
  name: string; label?: string; note?: string; you?: boolean; children?: TreeNode[];
  /** Anything worth showing when this person is opened: code, sales, commission, joined… */
  details?: { k: string; v: string; gold?: boolean }[];
  /** Somewhere to go for the full picture (their own page, their code, etc.). */
  href?: string;
};

/** Everyone sitting under this person, however deep. */
function countBelow(n: TreeNode): number {
  return (n.children || []).reduce((t, c) => t + 1 + countBelow(c), 0);
}

/**
 * An org tree you can work with rather than just look at.
 *
 * Two separate things happen on a row, because they are two separate questions:
 *   the ▶ chevron  — "who is under this person?"   (opens their branch)
 *   the name       — "who IS this person?"          (opens their details inline)
 *
 * Rolling both into one click meant you could never see someone's numbers without also
 * unfolding their whole downline on top of them.
 *
 * Levels below the first start closed: a large network rendered fully open is a wall of names
 * nobody reads. Anyone with people under them shows how many, so it is clear what is hidden.
 */
export default function FamilyChart({ root }: { root: TreeNode }) {
  const total = countBelow(root);
  const [allOpen, setAllOpen] = useState<boolean | null>(null);

  return (
    <div data-family-chart className="card-lux rounded-2xl p-5 overflow-x-auto">
      {total > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <span className="text-[11.5px] text-faint">
            {total} {total === 1 ? "person" : "people"} in this network · tap ▶ to open a branch, tap a name for their details
          </span>
          <button
            type="button"
            onClick={() => setAllOpen((v) => (v === true ? false : true))}
            className="text-[11.5px] font-semibold text-gold hover:underline"
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>
      )}
      <div className="min-w-[280px] text-[13px]">
        <TreeItem n={root} depth={0} forceOpen={allOpen} />
      </div>
    </div>
  );
}

function TreeItem({ n, depth, forceOpen }: { n: TreeNode; depth: number; forceOpen: boolean | null }) {
  const kids = n.children || [];
  const below = countBelow(n);
  // The top two levels start open so the shape is visible; deeper branches wait to be asked for.
  const [open, setOpen] = useState(depth < 1);
  const [showDetails, setShowDetails] = useState(false);
  // A parent's Expand/Collapse all wins until the row is clicked again.
  const isOpen = forceOpen === null ? open : forceOpen;
  React.useEffect(() => { if (forceOpen !== null) setOpen(forceOpen); }, [forceOpen]);

  const expandable = kids.length > 0;
  const hasDetails = !!(n.details?.length || n.href);

  return (
    <div className={depth ? "ml-3 sm:ml-5 border-l-2 border-[hsl(var(--gold)/0.25)] pl-3 sm:pl-5" : ""}>
      <div
        className={
          "inline-flex items-center gap-2 rounded-xl px-2.5 py-1.5 my-1 text-left transition-colors " +
          (n.you ? "bg-gold-soft/50 ring-1 ring-[hsl(var(--gold)/0.4)]" : "bg-card ring-1 ring-border") +
          (showDetails ? " ring-[hsl(var(--gold)/0.55)]" : "")
        }
      >
        {expandable ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={isOpen}
            title={isOpen ? `Hide ${n.name}'s network` : `Show ${n.name}'s network`}
            className="text-gold text-[10px] px-1 -ml-1 hover:opacity-70 transition-opacity shrink-0"
          >
            <span className={"inline-block transition-transform " + (isOpen ? "rotate-90" : "")}>▶</span>
          </button>
        ) : (
          <span aria-hidden="true" className="w-[8px] shrink-0" />
        )}

        {n.label && <span className="section-label !text-gold shrink-0">{n.label}</span>}

        {hasDetails ? (
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            title={`${showDetails ? "Hide" : "Show"} ${n.name}'s details`}
            className="font-[560] hover:text-gold transition-colors"
          >
            {n.name}
            {n.you && <span className="text-gold"> (you)</span>}
          </button>
        ) : (
          <span className="font-[560]">
            {n.name}
            {n.you && <span className="text-gold"> (you)</span>}
          </span>
        )}

        {n.note && <span className="text-[11.5px] text-faint">· {n.note}</span>}
        {expandable && !isOpen && <span className="text-[11px] text-faint shrink-0">+{below}</span>}
      </div>

      {showDetails && hasDetails && (
        <div className={"my-1 rounded-xl bg-subtle/60 px-3.5 py-2.5 text-[12.5px] max-w-[420px] " + (depth ? "" : "ml-1")}>
          {(n.details || []).map((d, i) => (
            <div key={i} className="flex gap-2 py-[3px]">
              <span className="text-muted-foreground shrink-0 w-[104px]">{d.k}</span>
              <span className={d.gold ? "text-gold font-[560] font-mono" : "text-foreground"}>{d.v}</span>
            </div>
          ))}
          {n.href && (
            <a href={n.href} className="inline-block mt-1.5 text-[11.5px] font-semibold text-gold hover:underline">
              Open full view →
            </a>
          )}
        </div>
      )}

      {isOpen && kids.map((c, i) => <TreeItem key={`${c.name}-${i}`} n={c} depth={depth + 1} forceOpen={forceOpen} />)}
    </div>
  );
}
