"use client";

import { motion } from "framer-motion";
import { fadeUp, VIEWPORT_SOFT } from "@/lib/motion";

export function Philosophy() {
  return (
    <section id="philosophy" className="scroll-mt-24 py-28 sm:py-36">
      <div className="container">
        <motion.p
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_SOFT}
          className="section-label"
        >
          Philosophy
        </motion.p>

        <motion.blockquote
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_SOFT}
          transition={{ delay: 0.08 }}
          className="mt-4 text-quote font-[460] text-balance"
        >
          We believe technology should adapt to people.
          <br />
          <span className="text-muted-foreground">
            Not force people to adapt to technology.
          </span>
        </motion.blockquote>

        <motion.p
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_SOFT}
          transition={{ delay: 0.16 }}
          className="mt-10 max-w-2xl text-pretty text-[1.075rem] leading-relaxed text-muted-foreground"
        >
          The best software disappears. It does not demand attention, training, or
          patience — it simply removes friction from the work you already do. That is
          the standard every Avloryn product is held to: not how advanced it is, but
          how effortless it makes the people who use it.
        </motion.p>
      </div>
    </section>
  );
}
