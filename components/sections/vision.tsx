"use client";

import { motion } from "framer-motion";
import { fadeUp, stagger, VIEWPORT_SOFT } from "@/lib/motion";
import { SectionHeading } from "@/components/ui/section-heading";

const FUTURE = [
  { icon: "◆", title: "Productivity", text: "Removing busywork from everyday work." },
  { icon: "◇", title: "Research", text: "From question to insight, faster." },
  { icon: "◈", title: "Business", text: "Operations that run themselves." },
  { icon: "○", title: "Education", text: "Learning that adapts to the learner." },
  { icon: "△", title: "Entertainment", text: "Experiences worth your time." },
];

export function Vision() {
  return (
    <section id="vision" className="scroll-mt-24 py-28 sm:py-36">
      <div className="container">
        <SectionHeading
          label="Vision"
          title={
            <>
              Today, one product.
              <br className="hidden sm:block" /> Tomorrow, an ecosystem.
            </>
          }
          lede="We are not building a single tool. We are building a company that solves real problems across the places people spend their lives — each product an intelligent assistant in its own right."
        />

        <div className="mt-16">
          {/* Today node */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_SOFT}
            className="card-lux relative max-w-md rounded-3xl p-7"
          >
            <span className="inline-flex items-center gap-2 text-[0.75rem] font-medium uppercase tracking-[0.14em] text-gold">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
              </span>
              Today
            </span>
            <h3 className="mt-3 text-2xl font-[560] tracking-[-0.02em]">Livodraft</h3>
            <p className="mt-2 text-muted-foreground">
              Academic research &amp; writing, end to end.
            </p>
          </motion.div>

          {/* connector */}
          <div className="relative ml-8 flex flex-col py-2" aria-hidden="true">
            <motion.span
              initial={{ height: 0 }}
              whileInView={{ height: 48 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="block w-px bg-gradient-to-b from-gold to-border"
            />
          </div>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_SOFT}
            className="section-label mb-7"
          >
            Future areas
          </motion.p>

          <motion.div
            variants={stagger(0.08)}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_SOFT}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {FUTURE.map((item) => (
              <motion.div
                key={item.title}
                variants={fadeUp}
                className="card-lux card-lux-hover group relative overflow-hidden rounded-2xl p-6"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-[1.1rem] text-foreground transition-colors duration-300 group-hover:bg-foreground group-hover:text-background">
                  {item.icon}
                </span>
                <h4 className="mt-5 text-[1.15rem] font-[520] tracking-[-0.01em]">
                  {item.title}
                </h4>
                <p className="mt-1.5 text-[0.95rem] leading-relaxed text-muted-foreground">
                  {item.text}
                </p>
              </motion.div>
            ))}

            {/* "more to come" tile */}
            <motion.div
              variants={fadeUp}
              className="flex items-center justify-center rounded-2xl border border-dashed border-border-strong p-6 text-center text-[0.95rem] text-faint"
            >
              And more, in time.
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
