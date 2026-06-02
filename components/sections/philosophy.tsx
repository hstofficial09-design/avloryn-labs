"use client";

import { motion } from "framer-motion";
import { EASE, fadeUp, VIEWPORT_SOFT } from "@/lib/motion";

const LINE_A = "We believe technology should adapt to people.";
const LINE_B = "Not force people to adapt to technology.";

function Words({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <span className="inline">
      {text.split(" ").map((word, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom">
          <motion.span
            className={"inline-block " + (muted ? "text-muted-foreground" : "")}
            initial={{ y: "100%", opacity: 0 }}
            whileInView={{ y: "0%", opacity: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.7, ease: EASE, delay: i * 0.045 }}
          >
            {word}
          </motion.span>
          {" "}
        </span>
      ))}
    </span>
  );
}

export function Philosophy() {
  return (
    <section id="philosophy" className="scroll-mt-24 py-28 sm:py-36">
      <div className="container max-w-5xl">
        <motion.p
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_SOFT}
          className="section-label"
        >
          Philosophy
        </motion.p>

        <blockquote className="mt-8 text-quote font-[460] text-balance">
          <Words text={LINE_A} />
          <br />
          <Words text={LINE_B} muted />
        </blockquote>

        <motion.p
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_SOFT}
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
