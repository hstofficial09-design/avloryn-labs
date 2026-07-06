"use client";

import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { EASE, lineReveal, stagger } from "@/lib/motion";
import { Button, ArrowRight } from "@/components/ui/button";
import { Magnetic } from "@/components/ui/magnetic";
import { HeroSurface } from "@/components/sections/hero-surface";

const HEADLINE = [
  { text: "Software should work", muted: false },
  { text: "for people.", muted: false },
  { text: "Not the other way around.", muted: true },
];

export function Hero() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);

  // Pointer parallax — normalized -0.5..0.5, fed through springs.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 60, damping: 18 });
  const sy = useSpring(py, { stiffness: 60, damping: 18 });

  function onMove(e: React.MouseEvent<HTMLElement>) {
    if (reduce) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  }

  return (
    <section
      id="hero"
      ref={ref}
      onMouseMove={onMove}
      className="relative overflow-hidden pb-20 pt-32 sm:pb-28 md:pt-40 lg:pb-36"
    >
      {/* soft neutral light — luxe depth, no colour */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <Orb className="left-[6%] top-[10%] h-[40rem] w-[40rem]" depth={18} mx={sx} my={sy} />
        <Orb className="right-[2%] top-[2%] h-[32rem] w-[32rem]" depth={30} mx={sx} my={sy} />
        <Orb className="bottom-[0%] left-[40%] h-[30rem] w-[30rem]" depth={12} mx={sx} my={sy} />
      </div>
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-grid" />

      <div className="container grid items-center gap-14 lg:grid-cols-[1.04fr_0.96fr] lg:gap-10">
        {/* Copy */}
        <div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
            className="eyebrow"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gold" />
            </span>
            Avloryn Labs · Building intelligent software
          </motion.p>

          <h1 className="mt-6 text-display-lg font-[560] text-balance">
            {HEADLINE.map((line, i) => (
              <span key={i} className="block overflow-hidden pb-[0.08em]">
                <motion.span
                  variants={lineReveal}
                  initial="hidden"
                  animate="visible"
                  transition={{ duration: 0.95, ease: EASE, delay: 0.25 + i * 0.12 }}
                  className={
                    line.muted ? "block text-muted-foreground" : "block"
                  }
                >
                  {line.text}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.7 }}
            className="mt-7 max-w-xl text-pretty text-[1.075rem] leading-relaxed text-muted-foreground sm:text-[1.15rem]"
          >
            Avloryn Labs builds intelligent software products designed to simplify
            work, reduce effort, and help people focus on what truly matters.
          </motion.p>

          <motion.div
            variants={stagger(0.1, 0.85)}
            initial="hidden"
            animate="visible"
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <motion.span variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}>
              <Magnetic>
                <Button href="https://livodraft.com" size="lg" target="_blank" rel="noopener noreferrer">
                  Explore LivoDraft
                </Button>
              </Magnetic>
            </motion.span>
            <motion.span variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}>
              <Button href="#contact" size="lg" variant="secondary">
                Contact Us <ArrowRight />
              </Button>
            </motion.span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.05 }}
            className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.9rem] text-faint"
          >
            <span>
              <strong className="font-[500] text-foreground">LivoDraft</strong> · Now live
            </span>
            <span aria-hidden="true" className="h-3 w-px bg-border-strong" />
            <span>More products in development</span>
          </motion.div>
        </div>

        {/* Visual */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, ease: EASE, delay: 0.4 }}
          className="relative"
        >
          <HeroSurface mx={sx} my={sy} />
        </motion.div>
      </div>

      {/* scroll cue */}
      <motion.a
        href="#philosophy"
        aria-label="Scroll to philosophy"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
        className="absolute bottom-7 left-1/2 hidden -translate-x-1/2 lg:block"
      >
        <span className="flex h-9 w-[22px] items-start justify-center rounded-full border border-border-strong p-1.5">
          <motion.span
            className="h-2 w-[3px] rounded-full bg-faint"
            animate={{ y: [0, 8, 0], opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
        </span>
      </motion.a>
    </section>
  );
}

function Orb({
  className,
  depth,
  mx,
  my,
}: {
  className: string;
  depth: number;
  mx: MotionValue<number>;
  my: MotionValue<number>;
}) {
  const x = useSpring(useTransform(mx, (v) => v * depth), { stiffness: 40, damping: 20 });
  const y = useSpring(useTransform(my, (v) => v * depth), { stiffness: 40, damping: 20 });
  return (
    <motion.span
      style={{ x, y }}
      className={`light-pool absolute block rounded-full blur-[30px] ${className}`}
    />
  );
}
