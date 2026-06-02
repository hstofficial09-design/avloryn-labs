"use client";

import { motion } from "framer-motion";
import { fadeUp, stagger, VIEWPORT_SOFT } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function SectionHeading({
  label,
  title,
  lede,
  align = "left",
  className,
}: {
  label: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <motion.div
      variants={stagger(0.12)}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT_SOFT}
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
        className
      )}
    >
      <motion.p variants={fadeUp} className="section-label">
        {label}
      </motion.p>
      <motion.h2
        variants={fadeUp}
        className="mt-4 text-heading font-[560] text-balance"
      >
        {title}
      </motion.h2>
      {lede && (
        <motion.p
          variants={fadeUp}
          className="mt-5 text-pretty text-[1.05rem] leading-relaxed text-muted-foreground"
        >
          {lede}
        </motion.p>
      )}
    </motion.div>
  );
}
