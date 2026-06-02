"use client";

import { motion, type Variants } from "framer-motion";
import { fadeUp, VIEWPORT } from "@/lib/motion";

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  variants?: Variants;
  delay?: number;
  /** Renders as a different element while keeping motion behaviour. */
  as?: "div" | "span" | "li" | "p";
  amount?: number;
}

/**
 * Scroll-triggered reveal. Animates once when it enters the viewport.
 * Wraps framer-motion so sections stay declarative.
 */
export function Reveal({
  children,
  className,
  variants = fadeUp,
  delay = 0,
  as = "div",
  amount,
}: RevealProps) {
  // Cast to a single concrete motion component so the union of element
  // prop types doesn't break the JSX overload check. Runtime tag is correct.
  const MotionTag = motion[as] as typeof motion.div;
  return (
    <MotionTag
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={amount ? { once: true, amount } : VIEWPORT}
      transition={delay ? { delay } : undefined}
    >
      {children}
    </MotionTag>
  );
}
