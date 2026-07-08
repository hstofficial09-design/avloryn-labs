"use client";

import {
  motion,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";

/**
 * Abstract product surface — an elegant, brand-agnostic UI suggestion.
 * Not a literal screenshot; it implies "software working quietly."
 */
export function HeroSurface({
  mx,
  my,
}: {
  mx: MotionValue<number>;
  my: MotionValue<number>;
}) {
  const rotX = useSpring(useTransform(my, (v) => v * -6), { stiffness: 50, damping: 16 });
  const rotY = useSpring(useTransform(mx, (v) => v * 6), { stiffness: 50, damping: 16 });
  const tx = useSpring(useTransform(mx, (v) => v * 18), { stiffness: 50, damping: 16 });
  const ty = useSpring(useTransform(my, (v) => v * 18), { stiffness: 50, damping: 16 });

  // floating chips drift a little more for depth
  const chipX = useSpring(useTransform(mx, (v) => v * 42), { stiffness: 50, damping: 16 });
  const chipY = useSpring(useTransform(my, (v) => v * 42), { stiffness: 50, damping: 16 });

  return (
    <div className="relative mx-auto max-w-md [perspective:1400px]">
      <motion.div
        style={{ rotateX: rotX, rotateY: rotY, x: tx, y: ty, transformStyle: "preserve-3d" }}
        className="card-lux relative rounded-[1.75rem] p-2.5 backdrop-blur-xl"
      >
        {/* window chrome */}
        <div className="flex items-center gap-1.5 px-3 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          <span className="ml-auto text-[0.66rem] font-medium tracking-wide text-faint">
            avloryn · workspace
          </span>
        </div>

        <div className="neu-inset rounded-[1.25rem] p-5">
          {/* header row */}
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-foreground text-background shadow-soft">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
                <path d="M5 12l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="flex-1 space-y-1.5">
              <span className="block h-2.5 w-1/2 rounded-full bg-muted" />
              <span className="block h-2 w-1/3 rounded-full bg-muted" />
            </div>
          </div>

          {/* animated progress bars */}
          <div className="mt-5 space-y-3">
            {[84, 62, 73].map((w, i) => (
              <div key={i} className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <motion.span
                  className="block h-full rounded-full bg-foreground/80"
                  initial={{ width: 0 }}
                  whileInView={{ width: `${w}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.4 + i * 0.15 }}
                />
              </div>
            ))}
          </div>

          {/* step chips */}
          <div className="mt-5 flex gap-2">
            {["Draft", "Refine", "Submit"].map((s, i) => (
              <span
                key={s}
                className={
                  "rounded-full px-3 py-1.5 text-[0.72rem] font-medium " +
                  (i === 2
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground")
                }
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </motion.div>

      {/* floating glass cards */}
      <motion.div
        style={{ x: chipX, y: chipY }}
        className="absolute -left-6 top-10 hidden items-center gap-2 rounded-2xl border border-border glass px-3.5 py-2.5 text-[0.78rem] shadow-lift sm:flex"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
        <span className="h-2 w-2 rounded-full bg-accent animate-pulse-dot" />
        <span className="text-muted-foreground">Working quietly in the background</span>
      </motion.div>

      <motion.div
        style={{ x: chipX, y: chipY }}
        className="absolute -right-4 bottom-8 hidden flex-col rounded-2xl border border-border glass px-4 py-3 shadow-lift sm:flex"
        animate={{ y: [0, 12, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
      >
        <span className="text-[1.35rem] font-[560] leading-none tracking-tight">−32%</span>
        <span className="mt-1 text-[0.72rem] text-muted-foreground">effort, every week</span>
      </motion.div>
    </div>
  );
}
