"use client";

import { motion } from "framer-motion";
import { fadeUp, stagger, VIEWPORT_SOFT, EASE } from "@/lib/motion";
import { SectionHeading } from "@/components/ui/section-heading";
import { Button, ArrowRight } from "@/components/ui/button";
import { Magnetic } from "@/components/ui/magnetic";
import { LivodraftWordmark } from "@/components/ui/livodraft-wordmark";
import { FAQS } from "./data";

const CREATE = [
  "Thesis & dissertation",
  "Research paper",
  "Project report",
  "Synopsis",
  "Research proposal",
  "Literature & systematic review",
];

const AUDIENCE = [
  "PhD scholars",
  "MTech & MSc students",
  "BTech, BSc & BA final-year",
  "Early-career researchers",
];

const BENEFITS = [
  "A complete, structured document — not sentence-by-sentence help.",
  "Formatted to your university's standards.",
  "References included.",
  "A fully editable Word file — refine it your way.",
];

const STEPS = [
  { n: "01", t: "Tell us what you need." },
  { n: "02", t: "We draft your document." },
  { n: "03", t: "Download an editable Word file." },
];

function Check() {
  return (
    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-foreground text-background">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
        <path
          d="M5 12l4 4L19 7"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function LivodraftContent() {
  return (
    <>
      {/* SECTION 1 — HERO */}
      <section className="relative overflow-hidden pt-36 pb-24 sm:pt-44 sm:pb-28">
        <div aria-hidden="true" className="bg-grid absolute inset-0 -z-10" />
        <div className="container">
          <motion.div
            variants={stagger(0.1)}
            initial="hidden"
            animate="visible"
            className="max-w-3xl"
          >
            <motion.div variants={fadeUp}>
              <LivodraftWordmark className="text-[2.4rem] leading-none sm:text-[3.1rem]" />
            </motion.div>

            <motion.span variants={fadeUp} className="eyebrow mt-7">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gold" />
              </span>
              Private Beta · Limited invitations
            </motion.span>

            <motion.h1
              variants={fadeUp}
              className="mt-6 text-display font-[560] tracking-[-0.03em] text-balance"
            >
              Your thesis, research paper, or project report — drafted, formatted, and referenced.
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mt-6 max-w-2xl text-pretty text-[1.15rem] leading-relaxed text-muted-foreground"
            >
              LivoDraft is an AI-assisted academic drafting studio for Indian students. Tell it what
              you need, and get back a structured, formatted, referenced Word document you can edit
              and submit.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-9">
              <Magnetic>
                <Button href="/#contact" size="lg">
                  Request Early Access <ArrowRight />
                </Button>
              </Magnetic>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* SECTION 2 — WHAT IS LIVODRAFT (stand-alone definition for GEO) */}
      <section className="border-y border-border bg-subtle py-20 sm:py-24">
        <div className="container">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT_SOFT}
            transition={{ duration: 0.8, ease: EASE }}
            className="mx-auto max-w-4xl text-balance text-center text-[1.5rem] font-[540] leading-snug tracking-[-0.02em] sm:text-[1.9rem]"
          >
            LivoDraft is an AI-assisted academic drafting studio that helps Indian students produce a
            structured, formatted, referenced academic document —{" "}
            <span className="font-serif italic text-gold">built to your university&rsquo;s standards.</span>
          </motion.p>
        </div>
      </section>

      {/* SECTION 3 — WHAT YOU CAN CREATE */}
      <section className="py-24 sm:py-32">
        <div className="container">
          <SectionHeading
            label="What you can create"
            title={
              <>
                One studio for every academic
                <br className="hidden sm:block" /> document you need to submit.
              </>
            }
          />
          <motion.ul
            variants={stagger(0.06)}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_SOFT}
            className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {CREATE.map((item) => (
              <motion.li
                key={item}
                variants={fadeUp}
                className="card-lux card-lux-hover flex items-center gap-3 rounded-2xl p-6"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                <span className="text-[1.05rem] font-[520] tracking-[-0.01em]">{item}</span>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </section>

      {/* SECTION 4 — WHO IT'S FOR */}
      <section className="border-t border-border bg-subtle py-24 sm:py-32">
        <div className="container">
          <SectionHeading
            label="Who it's for"
            title="Built for Indian students at every level."
          />
          <motion.ul
            variants={stagger(0.06)}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_SOFT}
            className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            {AUDIENCE.map((item) => (
              <motion.li
                key={item}
                variants={fadeUp}
                className="card-lux card-lux-hover flex flex-col items-start gap-3 rounded-2xl p-6"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                <span className="text-[1.05rem] font-[520] tracking-[-0.01em]">{item}</span>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </section>

      {/* SECTION 5 — WHAT YOU GET */}
      <section className="py-24 sm:py-32">
        <div className="container">
          <SectionHeading
            label="What you get"
            title={
              <>
                A finished draft you can
                <br className="hidden sm:block" /> build on.
              </>
            }
          />
          <motion.ul
            variants={stagger(0.06)}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_SOFT}
            className="mt-12 grid gap-4 sm:grid-cols-2"
          >
            {BENEFITS.map((b) => (
              <motion.li
                key={b}
                variants={fadeUp}
                className="card-lux flex items-start gap-4 rounded-2xl p-6"
              >
                <Check />
                <span className="text-[1.05rem] leading-relaxed text-muted-foreground">{b}</span>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </section>

      {/* SECTION 6 — HOW IT WORKS */}
      <section className="border-t border-border bg-subtle py-24 sm:py-32">
        <div className="container">
          <SectionHeading label="How it works" title="Three steps to a submittable draft." />
          <motion.ol
            variants={stagger(0.08)}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_SOFT}
            className="mt-12 grid gap-4 sm:grid-cols-3"
          >
            {STEPS.map((s) => (
              <motion.li
                key={s.n}
                variants={fadeUp}
                className="card-lux card-lux-hover group rounded-3xl p-8"
              >
                <span className="font-serif text-[1.7rem] italic text-faint transition-colors duration-300 group-hover:text-gold">
                  {s.n}
                </span>
                <p className="mt-4 text-[1.1rem] font-[520] tracking-[-0.01em]">{s.t}</p>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </section>

      {/* SECTION 7 — FAQ (visible + powers FAQPage JSON-LD) */}
      <section className="py-24 sm:py-32">
        <div className="container">
          <SectionHeading label="FAQ" title="Questions, answered." />
          <motion.div
            variants={stagger(0.06)}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_SOFT}
            className="mx-auto mt-12 max-w-3xl divide-y divide-border"
          >
            {FAQS.map((f) => (
              <motion.div key={f.q} variants={fadeUp} className="py-6">
                <h3 className="text-[1.1rem] font-[540] tracking-[-0.01em]">{f.q}</h3>
                <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">{f.a}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* SECTION 8 — FINAL CTA */}
      <section className="border-t border-border bg-subtle py-24 sm:py-32">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT_SOFT}
            transition={{ duration: 0.8, ease: EASE }}
            className="mx-auto max-w-2xl text-center"
          >
            <h2 className="text-heading font-[560] text-balance">
              Join the early testers shaping LivoDraft.
            </h2>
            <div className="mt-8 flex justify-center">
              <Magnetic>
                <Button href="/#contact" size="lg">
                  Request Early Access <ArrowRight />
                </Button>
              </Magnetic>
            </div>
            <p className="mt-8 font-serif text-[1.4rem] italic text-muted-foreground">
              LivoDraft — your academic drafting studio.
            </p>
          </motion.div>
        </div>
      </section>
    </>
  );
}
