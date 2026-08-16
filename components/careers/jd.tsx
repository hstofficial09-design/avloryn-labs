import { parseBlocks, type Block, type Inline } from "@/lib/careers-md";

/** Owner-written text rendered as React elements — never as raw markup. */
function Runs({ runs }: { runs: Inline[] }) {
  return (
    <>
      {runs.map((r, i) =>
        r.t === "b" ? <strong key={i}>{r.v}</strong>
        : r.t === "i" ? <em key={i}>{r.v}</em>
        : r.t === "a" ? (
          <a key={i} href={r.href} target="_blank" rel="noopener noreferrer nofollow">{r.v}</a>
        ) : (
          <span key={i}>{r.v}</span>
        ),
      )}
    </>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) =>
        b.t === "h" ? <h2 key={i}><Runs runs={b.text} /></h2>
        : b.t === "p" ? <p key={i}><Runs runs={b.text} /></p>
        : b.t === "ul" ? (
          <ul key={i}>{b.items.map((it, j) => <li key={j}><Runs runs={it} /></li>)}</ul>
        ) : (
          <ol key={i} className="my-4 list-decimal space-y-2 pl-6 marker:text-faint">
            {b.items.map((it, j) => <li key={j}><Runs runs={it} /></li>)}
          </ol>
        ),
      )}
    </>
  );
}

/** The job description on the public role page. */
export function JobDescription({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  if (!blocks.length) return null;
  return (
    <div className="legal-prose mt-10">
      <Blocks blocks={blocks} />
    </div>
  );
}

/** Same rendering, used for the live preview inside the owner's editor. */
export function JobDescriptionPreview({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  if (!blocks.length) {
    return <p className="text-[12.5px] text-faint">Nothing to preview yet — start writing on the left.</p>;
  }
  return (
    <div className="legal-prose text-[13px]">
      <Blocks blocks={blocks} />
    </div>
  );
}
