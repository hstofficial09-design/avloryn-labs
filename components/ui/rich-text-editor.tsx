"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * The one text editor used everywhere in the portal — job descriptions, role terms, the NDA.
 *
 * It writes a small, readable marker language (## heading, - bullet, 1. numbered, **bold**,
 * *italic*, [text](link)) rather than HTML, so the same text can be rendered as a web page or
 * drawn into a PDF. Each place passes `tools` for what its own renderer can actually show —
 * offering a button whose formatting later prints as literal asterisks would be worse than
 * not offering it.
 */
export type Tool = "h" | "b" | "i" | "ul" | "ol" | "a";

export const ALL_TOOLS: Tool[] = ["h", "b", "i", "ul", "ol", "a"];

const META: Record<Tool, { label: string; title: string }> = {
  h: { label: "H", title: "Heading" },
  b: { label: "B", title: "Bold" },
  i: { label: "I", title: "Italic" },
  ul: { label: "• List", title: "Bullet list" },
  ol: { label: "1. List", title: "Numbered list" },
  a: { label: "Link", title: "Insert a link" },
};

export function RichTextEditor({
  value, onChange, rows = 14, placeholder, tools = ALL_TOOLS, preview, hint, className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  tools?: Tool[];
  /** Rendered when the writer switches to Preview. Omit to hide the Preview toggle. */
  preview?: (source: string) => ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [showPreview, setShowPreview] = useState(false);

  const field =
    "w-full text-[14px] neu-inset text-foreground placeholder:text-faint rounded-[12px] px-3.5 py-2.5 " +
    "outline-none focus:ring-2 focus:ring-gold/25 resize-y font-sans text-[12.5px] leading-relaxed";

  function apply(kind: Tool) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart, end = el.selectionEnd;
    const picked = value.slice(start, end);
    let next = value, caret = end;

    /** Prefix whole lines, so a marker never lands mid-sentence. */
    const linePrefix = (prefix: string) => {
      const from = value.lastIndexOf("\n", start - 1) + 1;
      const nl = value.indexOf("\n", end);
      const to = nl === -1 ? value.length : nl;
      const body = value.slice(from, to) || "Write here";
      const done = body
        .split("\n")
        .map((l, i) => (prefix === "1. " ? `${i + 1}. ` : prefix) + l.replace(/^(#{1,3}\s|[-•*]\s|\d+[.)]\s)/, ""))
        .join("\n");
      next = value.slice(0, from) + done + value.slice(to);
      caret = from + done.length;
    };

    if (kind === "h") linePrefix("## ");
    else if (kind === "ul") linePrefix("- ");
    else if (kind === "ol") linePrefix("1. ");
    else if (kind === "a") {
      const url = window.prompt("Link address", "https://");
      if (!url) return;
      const text = picked || "link text";
      const ins = `[${text}](${url})`;
      next = value.slice(0, start) + ins + value.slice(end);
      caret = start + ins.length;
    } else {
      const mark = kind === "b" ? "**" : "*";
      const text = picked || (kind === "b" ? "bold text" : "italic text");
      next = value.slice(0, start) + mark + text + mark + value.slice(end);
      caret = start + mark.length + text.length + mark.length;
    }

    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caret, caret); });
  }

  const syntax: Record<Tool, string> = {
    h: "## Heading", ul: "- bullet", ol: "1. numbered",
    b: "**bold**", i: "*italic*", a: "[text](link)",
  };

  return (
    <div className={className}>
      {preview && (
        <div className="flex justify-end mb-1.5">
          <button type="button" onClick={() => setShowPreview((v) => !v)} className="text-[11.5px] font-semibold text-gold hover:underline">
            {showPreview ? "Back to writing" : "Preview"}
          </button>
        </div>
      )}

      {showPreview && preview ? (
        <div className="neu-inset rounded-[12px] p-4 min-h-[200px]">{preview(value)}</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tools.map((t) => (
              <button
                key={t} type="button" title={META[t].title} onClick={() => apply(t)}
                className="neu-chip rounded-lg px-2.5 py-1 text-[11.5px] font-[600] text-foreground/70 hover:text-foreground"
              >
                {META[t].label}
              </button>
            ))}
          </div>
          <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={field} placeholder={placeholder} />
          <p className="mt-1 text-[11px] text-faint">
            {hint ?? (
              <>Select text and use the buttons, or type it: {tools.map((t) => syntax[t]).join(" · ")}. A blank line starts a new paragraph.</>
            )}
          </p>
        </>
      )}
    </div>
  );
}
