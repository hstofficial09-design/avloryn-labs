"use client";
import React, { useState } from "react";

export type TreeNode = { name: string; label?: string; note?: string; you?: boolean; children?: TreeNode[] };

/** Everyone sitting under this person, however deep. */
function countBelow(n: TreeNode): number {
  return (n.children || []).reduce((t, c) => t + 1 + countBelow(c), 0);
}

/**
 * An org tree you can actually work with: click a name to open or close their network.
 *
 * Levels below the first are collapsed to begin with — a large network rendered fully open
 * is a wall of names nobody reads. Anyone with people under them shows how many, so it is
 * obvious what is hidden before you click.
 */
export default function FamilyChart({ root }: { root: TreeNode }) {
  const total = countBelow(root);
  const [allOpen, setAllOpen] = useState<boolean | null>(null);

  return (
    <div className="card-lux rounded-2xl p-5 overflow-x-auto">
      {total > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <span className="text-[11.5px] text-faint">
            {total} {total === 1 ? "person" : "people"} in this network · click a name to open it
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
  // A parent's Expand/Collapse all wins until the row is clicked again.
  const isOpen = forceOpen === null ? open : forceOpen;
  React.useEffect(() => { if (forceOpen !== null) setOpen(forceOpen); }, [forceOpen]);

  const clickable = kids.length > 0;
  const Row = clickable ? "button" : "div";

  return (
    <div className={depth ? "ml-3 sm:ml-5 border-l-2 border-[hsl(var(--gold)/0.25)] pl-3 sm:pl-5" : ""}>
      <Row
        {...(clickable
          ? {
              type: "button" as const,
              onClick: () => setOpen((v) => !v),
              "aria-expanded": isOpen,
              title: isOpen ? `Hide ${n.name}'s network` : `Show ${n.name}'s network`,
            }
          : {})}
        className={
          "inline-flex items-center gap-2 rounded-xl px-3 py-1.5 my-1 text-left transition-colors " +
          (n.you ? "bg-gold-soft/50 ring-1 ring-[hsl(var(--gold)/0.4)]" : "bg-card ring-1 ring-border") +
          (clickable ? " hover:ring-[hsl(var(--gold)/0.5)] cursor-pointer" : "")
        }
      >
        {clickable && (
          <span aria-hidden="true" className={"text-gold text-[10px] transition-transform " + (isOpen ? "rotate-90" : "")}>
            ▶
          </span>
        )}
        {n.label && <span className="section-label !text-gold shrink-0">{n.label}</span>}
        <span className="font-[560]">
          {n.name}
          {n.you && <span className="text-gold"> (you)</span>}
        </span>
        {n.note && <span className="text-[11.5px] text-faint">· {n.note}</span>}
        {clickable && (
          <span className="text-[11px] text-faint shrink-0">
            {isOpen ? "" : `+${below}`}
          </span>
        )}
      </Row>
      {isOpen && kids.map((c, i) => <TreeItem key={`${c.name}-${i}`} n={c} depth={depth + 1} forceOpen={forceOpen} />)}
    </div>
  );
}
