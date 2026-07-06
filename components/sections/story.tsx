"use client";

import { motion } from "framer-motion";
import { fadeUp, stagger, VIEWPORT_SOFT } from "@/lib/motion";

export function Story() {
  return (
    <section id="story" className="scroll-mt-24 py-28 sm:py-36">
      <div className="container grid gap-12 lg:grid-cols-[0.32fr_0.68fr] lg:gap-16">
        <div>
          <motion.h2
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_SOFT}
            className="section-label lg:sticky lg:top-28"
          >
            Founding story
          </motion.h2>
        </div>

        <motion.div
          variants={stagger(0.1)}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_SOFT}
          className="max-w-2xl"
        >
          <motion.p
            variants={fadeUp}
            className="text-balance text-[1.7rem] font-[480] leading-[1.32] tracking-[-0.02em] sm:text-[2.05rem]"
          >
            Avloryn Labs began with a simple conviction: that software should solve
            meaningful problems and create genuine value — not merely exist.
          </motion.p>

          <motion.p
            variants={fadeUp}
            className="mt-8 text-pretty text-[1.05rem] leading-relaxed text-muted-foreground"
          >
            The company was founded by{" "}
            <strong className="font-[520] text-foreground">Hardev Singh Thakur</strong>,
            whose background in civil engineering shaped a particular way of seeing the
            world: as systems to be understood, refined, and built to last. That
            discipline — designing structures that people depend on without ever
            thinking about them — carries directly into how Avloryn approaches software.
          </motion.p>

          <motion.p
            variants={fadeUp}
            className="mt-5 text-pretty text-[1.05rem] leading-relaxed text-muted-foreground"
          >
            Drawn to entrepreneurship and the craft of problem-solving, he started
            Avloryn Labs to build a different kind of technology company: one defined
            not by the tools it uses, but by the difference its products make in
            people&apos;s daily lives. The ambition is long-term and deliberate — to
            build a portfolio of intelligent products that quietly give people back
            their time and attention.
          </motion.p>

          <motion.p
            variants={fadeUp}
            className="mt-8 font-serif text-[1.25rem] italic text-faint"
          >
            — Avloryn Labs
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
