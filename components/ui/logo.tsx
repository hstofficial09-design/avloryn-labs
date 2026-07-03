import { cn } from "@/lib/utils";

/** Avloryn Labs gold "A" mark (transparent PNG), shown bare — no badge/ring. */
export function LogoMark({
  size = 26,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/avloryn-mark.png"
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("object-contain", className)}
    />
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={24} className="text-foreground" />
      <span className="text-[1.06rem] font-[560] tracking-[-0.02em]">
        Avloryn
        <span className="text-muted-foreground font-[460]">&nbsp;Labs</span>
      </span>
    </span>
  );
}
