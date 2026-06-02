"use client";

import { motion } from "framer-motion";
import { EASE, VIEWPORT_SOFT } from "@/lib/motion";
import { SectionHeading } from "@/components/ui/section-heading";
import { Button, ArrowRight } from "@/components/ui/button";
import { Magnetic } from "@/components/ui/magnetic";

export function Product() {
  return (
    <section id="product" className="scroll-mt-24 bg-subtle py-28 sm:py-36">
      <div className="container">
        <SectionHeading
          label="Current Product"
          title={
            <>
              One product, built with care
              <br className="hidden sm:block" /> before the next.
            </>
          }
        />

        <motion.article
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT_SOFT}
          transition={{ duration: 0.9, ease: EASE }}
          className="card-lux group relative mt-14 overflow-hidden rounded-3xl p-8 sm:p-12"
        >
          {/* subtle neutral light pool on hover */}
          <div
            aria-hidden="true"
            className="light-pool pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-0 blur-[40px] transition-opacity duration-700 group-hover:opacity-100"
          />

          <div className="relative flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-4">
                <span className="grid h-12 w-12 place-items-center rounded-2xl border border-border bg-background text-foreground">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
                    <path d="M7 4h7l4 4v12H7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    <path d="M14 4v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    <line x1="9.5" y1="12" x2="15" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <line x1="9.5" y1="15" x2="13" y2="15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-2xl font-[560] tracking-[-0.02em]">Livodraft</h3>
                  <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[0.72rem] font-medium text-muted-foreground">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-60" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gold" />
                    </span>
                    Private Beta
                  </span>
                </div>
              </div>

              <p className="mt-6 text-pretty text-[1.1rem] leading-relaxed text-muted-foreground">
                An academic workflow platform designed to assist students and
                researchers — from the first research question to the final
                submission.
              </p>

              <p className="mt-4 text-[0.95rem] text-faint">
                Quietly in development. Opening to a small group of early testers.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Magnetic>
                  <Button href="#contact">
                    Request Early Access <ArrowRight />
                  </Button>
                </Magnetic>
                <span className="text-[0.85rem] text-faint">Limited invitations</span>
              </div>
            </div>

            {/* abstract emblem */}
            <div aria-hidden="true" className="relative hidden h-44 w-44 shrink-0 lg:block">
              <div className="absolute inset-0 rounded-full border border-border" />
              <div className="absolute inset-4 rounded-full border border-border" />
              <div className="absolute inset-8 rounded-full border border-dashed border-border-strong" />
              <motion.div
                className="absolute inset-0"
                animate={{ rotate: 360 }}
                transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
              >
                <span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full bg-gold shadow-soft" />
              </motion.div>
              <span className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-foreground text-background">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                  <path d="M5 12l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
          </div>
        </motion.article>
      </div>
    </section>
  );
}
