import { cn } from "@/lib/utils";

/**
 * Canonical LivoDraft wordmark — the permanent brand treatment for the product name.
 * "Livo" in the foreground colour, "Draft" in champagne gold. Font weight + tracking
 * are baked in so every appearance uses the SAME font and SAME colour; size/leading
 * are controlled by the caller via `className`.
 */
export function LivodraftWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-[600] tracking-[-0.035em]", className)}>
      Livo<span className="text-gold">Draft</span>
    </span>
  );
}
