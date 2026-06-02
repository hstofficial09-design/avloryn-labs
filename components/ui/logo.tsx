import { cn } from "@/lib/utils";

/** Abstract orbit mark — a node orbiting a core. "Technology orbits people." */
export function LogoMark({
  size = 26,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      fill="none"
    >
      <path
        d="M16 5a11 11 0 1 0 10.4 7.3"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
      />
      <circle cx="25" cy="7" r="3.2" fill="currentColor" />
    </svg>
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
