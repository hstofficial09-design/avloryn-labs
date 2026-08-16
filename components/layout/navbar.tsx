"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { NAV_LINKS } from "@/lib/nav";
import { Wordmark } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { Magnetic } from "@/components/ui/magnetic";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll when the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <motion.div
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        className={cn(
          "mx-auto flex items-center justify-between px-6 transition-all duration-500 ease-premium md:px-10 xl:px-[5.5rem] 2xl:px-28",
          scrolled
            ? "my-3 h-14 max-w-[1200px] rounded-full glass ring-hairline shadow-neu md:px-6 xl:px-6 2xl:px-6"
            : "my-4 h-16 max-w-none"
        )}
      >
        <a href="/" aria-label="Avloryn Labs — home" className="shrink-0">
          <Wordmark />
        </a>

        <nav
          aria-label="Primary"
          className="hidden flex-1 items-center justify-center gap-1 lg:flex"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-2 text-[0.9rem] text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a href="/careers" className="hidden lg:inline-flex rounded-full px-3.5 py-2 text-[0.9rem] text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground">
            Careers
          </a>
          <a href="/portal" className="hidden lg:inline-flex rounded-full px-3.5 py-2 text-[0.9rem] text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground">
            Partner Portal
          </a>
          <ThemeToggle />
          <div className="hidden lg:block">
            <Magnetic>
              <Button href="https://livodraft.com" size="md" target="_blank" rel="noopener noreferrer">
                Explore LivoDraft
              </Button>
            </Magnetic>
          </div>

          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="relative grid h-10 w-10 place-items-center rounded-full neu-chip lg:hidden"
          >
            <span className="sr-only">Menu</span>
            <span
              className={cn(
                "absolute h-[1.5px] w-4 bg-foreground transition-all duration-300 ease-premium",
                open ? "rotate-45" : "-translate-y-1"
              )}
            />
            <span
              className={cn(
                "absolute h-[1.5px] w-4 bg-foreground transition-all duration-300 ease-premium",
                open ? "-rotate-45" : "translate-y-1"
              )}
            />
          </button>
        </div>
      </motion.div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="mx-3 overflow-hidden rounded-3xl glass-solid ring-hairline p-3 shadow-lift lg:hidden"
          >
            <nav className="flex flex-col" aria-label="Mobile">
              {NAV_LINKS.map((link, i) => (
                <motion.a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * i + 0.05 }}
                  className="rounded-2xl px-4 py-3 text-[1.05rem] text-foreground transition-colors hover:bg-muted"
                >
                  {link.label}
                </motion.a>
              ))}
              <a href="/careers" onClick={() => setOpen(false)} className="rounded-2xl px-4 py-3 text-[1.05rem] text-foreground transition-colors hover:bg-muted">
                Careers
              </a>
              <a href="/portal" onClick={() => setOpen(false)} className="rounded-2xl px-4 py-3 text-[1.05rem] text-foreground transition-colors hover:bg-muted">
                Partner Portal
              </a>
              <Button href="https://livodraft.com" target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="mt-2 w-full">
                Explore LivoDraft
              </Button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
