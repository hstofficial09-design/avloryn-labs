"use client";
import React from "react";

export type TreeNode = { name: string; label?: string; note?: string; you?: boolean; children?: TreeNode[] };

/** A clean, responsive indented org tree — each level nested under a gold connector line.
 *  Used in every portal, scoped to that person's own family (their upline + downline). */
export default function FamilyChart({ root }: { root: TreeNode }) {
  return (
    <div className="card-lux rounded-2xl p-5 overflow-x-auto">
      <div className="min-w-[280px] text-[13px]">
        <TreeItem n={root} depth={0} />
      </div>
    </div>
  );
}

function TreeItem({ n, depth }: { n: TreeNode; depth: number }) {
  return (
    <div className={depth ? "ml-3 sm:ml-5 border-l-2 border-[hsl(var(--gold)/0.25)] pl-3 sm:pl-5" : ""}>
      <div className={"inline-flex items-center gap-2 rounded-xl px-3 py-1.5 my-1 " + (n.you ? "bg-gold-soft/50 ring-1 ring-[hsl(var(--gold)/0.4)]" : "bg-card ring-1 ring-border")}>
        {n.label && <span className="section-label !text-gold shrink-0">{n.label}</span>}
        <span className="font-[560]">{n.name}{n.you && <span className="text-gold"> (you)</span>}</span>
        {n.note && <span className="text-[11.5px] text-faint">· {n.note}</span>}
      </div>
      {n.children && n.children.length > 0 && n.children.map((c, i) => <TreeItem key={i} n={c} depth={depth + 1} />)}
    </div>
  );
}
