"use client";

import { motion } from "framer-motion";
import { fadeUp, stagger, VIEWPORT_SOFT } from "@/lib/motion";
import { SectionHeading } from "@/components/ui/section-heading";
import { cn } from "@/lib/utils";

const VALUES = [
  {
    num: "01",
    title: "Quality",
    text: "Every product earns its place by solving a problem that genuinely matters. If it does not, we do not ship it.",
    wide: true,
  },
  {
    num: "02",
    title: "Simplicity",
    text: "Complexity belongs inside the system — never in the hands of the people using it.",
  },
  {
    num: "03",
    title: "Trust",
    text: "You should only ever pay for the value you actually receive.",
  },
  {
    num: "04",
    title: "Human-Centered Design",
    text: "We design around how people already think, work, and live — not the other way around.",
  },
  {
    num: "05",
    title: "Long-Term Thinking",
    text: "We build products meant to last decades, not news cycles. Patience is a feature.",
    wide: true,
  },
];

export function Values() {
  return (
    <section id="values" className="scroll-mt-24 bg-subtle py-28 sm:py-36">
      <div className="container">
        <SectionHeading
          label="What we hold to"
          title={
            <>
              Five principles, every
              <br className="hidden sm:block" /> product, no exceptions.
            </>
          }
        />

        <motion.div
          variants={stagger(0.08)}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_SOFT}
          className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {VALUES.map((v) => (
            <motion.article
              key={v.num}
              variants={fadeUp}
              className={cn(
                "card-lux card-lux-hover group relative flex flex-col rounded-3xl p-7 sm:p-8",
                v.wide && "lg:col-span-2"
              )}
            >
              <span className="font-serif text-[1.6rem] italic text-faint transition-colors duration-300 group-hover:text-gold">
                {v.num}
              </span>
              <h3 className="mt-4 text-[1.4rem] font-[540] tracking-[-0.02em]">
                {v.title}
              </h3>
              <p className="mt-3 max-w-md text-pretty leading-relaxed text-muted-foreground">
                {v.text}
              </p>
              <span
                aria-hidden="true"
                className="mt-6 h-px w-0 bg-gold transition-all duration-500 ease-premium group-hover:w-16"
              />
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
