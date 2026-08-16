/**
 * A deliberately small formatting language for job descriptions.
 *
 * Only what a JD actually needs — headings, bullet and numbered lists, bold, italic and links.
 * Parsed into blocks rather than HTML so the page can render real React elements: owner-written
 * text is never injected as markup, so a stray "<script>" is just characters on the page.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; v: string }
  | { t: "i"; v: string }
  | { t: "a"; v: string; href: string };

export type Block =
  | { t: "h"; text: Inline[] }
  | { t: "p"; text: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] };

const LINK = /\[([^\]\n]{1,120})\]\(([^)\s]{1,300})\)/;
const BOLD = /\*\*([^*\n]{1,300})\*\*/;
const ITAL = /(?<!\*)\*([^*\n]{1,300})\*(?!\*)/;

/** Only http/https/mailto survive — a "javascript:" href never reaches an anchor. */
function safeHref(raw: string): string | null {
  const h = raw.trim();
  if (/^(https?:\/\/|mailto:)/i.test(h)) return h;
  if (/^www\./i.test(h)) return `https://${h}`;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(h)) return `https://${h}`;
  return null;
}

/** Split one line into inline runs. Longest-first so "**bold**" isn't read as italic. */
export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  let rest = line;
  let guard = 0;
  while (rest && guard++ < 200) {
    const m = [
      { re: LINK, kind: "a" as const },
      { re: BOLD, kind: "b" as const },
      { re: ITAL, kind: "i" as const },
    ]
      .map((c) => ({ ...c, hit: c.re.exec(rest) }))
      .filter((c) => c.hit)
      .sort((a, b) => a.hit!.index - b.hit!.index)[0];

    if (!m || !m.hit) break;
    const { hit, kind } = m;
    if (hit.index > 0) out.push({ t: "text", v: rest.slice(0, hit.index) });
    if (kind === "a") {
      const href = safeHref(hit[2]);
      // An unusable link keeps its words rather than vanishing.
      out.push(href ? { t: "a", v: hit[1], href } : { t: "text", v: hit[1] });
    } else {
      out.push({ t: kind, v: hit[1] });
    }
    rest = rest.slice(hit.index + hit[0].length);
  }
  if (rest) out.push({ t: "text", v: rest });
  return out.length ? out : [{ t: "text", v: line }];
}

export function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  const chunks = String(src || "").replace(/\r/g, "").split(/\n{2,}/);

  for (const chunk of chunks) {
    const lines = chunk.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
    if (!lines.length) continue;

    // A chunk can mix a heading with the list under it, so walk line by line.
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      if (/^#{1,3}\s+/.test(line)) {
        blocks.push({ t: "h", text: parseInline(line.replace(/^#{1,3}\s+/, "")) });
        i++; continue;
      }
      if (/^[-•*]\s+/.test(line)) {
        const items: Inline[][] = [];
        while (i < lines.length && /^[-•*]\s+/.test(lines[i])) {
          items.push(parseInline(lines[i].replace(/^[-•*]\s+/, "")));
          i++;
        }
        blocks.push({ t: "ul", items }); continue;
      }
      if (/^\d+[.)]\s+/.test(line)) {
        const items: Inline[][] = [];
        while (i < lines.length && /^\d+[.)]\s+/.test(lines[i])) {
          items.push(parseInline(lines[i].replace(/^\d+[.)]\s+/, "")));
          i++;
        }
        blocks.push({ t: "ol", items }); continue;
      }

      // Consecutive plain lines read as one paragraph.
      const para: string[] = [];
      while (i < lines.length && !/^(#{1,3}\s|[-•*]\s|\d+[.)]\s)/.test(lines[i])) {
        para.push(lines[i]); i++;
      }
      blocks.push({ t: "p", text: parseInline(para.join(" ")) });
    }
  }
  return blocks;
}

const escHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const inlineHtml = (runs: Inline[]) =>
  runs
    .map((r) =>
      r.t === "b" ? `<strong>${escHtml(r.v)}</strong>`
      : r.t === "i" ? `<em>${escHtml(r.v)}</em>`
      : r.t === "a" ? `<a href="${escHtml(r.href)}">${escHtml(r.v)}</a>`
      : escHtml(r.v),
    )
    .join("");

/** HTML for JobPosting.description — Google wants markup there, and everything is escaped. */
export function blocksToHtml(blocks: Block[]): string {
  return blocks
    .map((b) =>
      b.t === "h" ? `<h3>${inlineHtml(b.text)}</h3>`
      : b.t === "p" ? `<p>${inlineHtml(b.text)}</p>`
      : `<${b.t}>${b.items.map((i) => `<li>${inlineHtml(i)}</li>`).join("")}</${b.t}>`,
    )
    .join("");
}

/** Flat text for meta descriptions and previews. */
export function blocksToText(blocks: Block[]): string {
  const inl = (r: Inline[]) => r.map((x) => x.v).join("");
  return blocks
    .map((b) => (b.t === "h" || b.t === "p" ? inl(b.text) : b.items.map(inl).join(" · ")))
    .join(" ")
    .trim();
}
