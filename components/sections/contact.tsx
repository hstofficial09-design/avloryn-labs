"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fadeUp, stagger, VIEWPORT_SOFT } from "@/lib/motion";
import { Socials } from "@/components/sections/socials";

type Status = "idle" | "submitting" | "success" | "error";
type Errors = Partial<Record<"name" | "email" | "message", string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Contact() {
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = (data.get("name") as string)?.trim();
    const email = (data.get("email") as string)?.trim();
    const message = (data.get("message") as string)?.trim();

    const next: Errors = {};
    if (!name) next.name = "Please enter your name.";
    if (!email) next.email = "Please enter your email.";
    else if (!EMAIL_RE.test(email)) next.email = "That email doesn't look right.";
    if (!message) next.message = "A short message helps us help you.";

    setErrors(next);
    if (Object.keys(next).length) return;

    setStatus("submitting");
    setServerError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          message,
          intent: (data.get("intent") as string) || "",
          company: (data.get("company") as string) || "", // honeypot
        }),
      });
      const json = (await res.json().catch(() => ({ ok: false }))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setServerError(json.error || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("success");
      form.reset();
    } catch {
      setServerError("Network error — please check your connection and try again.");
      setStatus("error");
    }
  }

  return (
    <section id="contact" className="scroll-mt-24 bg-subtle py-28 sm:py-36">
      <div className="container grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        {/* intro + socials */}
        <motion.div
          variants={stagger(0.1)}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_SOFT}
        >
          <motion.p variants={fadeUp} className="section-label">
            Get in touch
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="mt-4 text-heading font-[560] text-balance"
          >
            Let&apos;s build something
            <br className="hidden sm:block" /> worth your time.
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mt-5 max-w-md text-pretty text-[1.05rem] leading-relaxed text-muted-foreground"
          >
            Whether you&apos;re using LivoDraft, want a conversation, or simply to
            follow the journey — we&apos;d like to hear from you.
          </motion.p>

          <motion.div variants={fadeUp} className="mt-8">
            <Socials />
          </motion.div>

          <motion.a
            variants={fadeUp}
            href="mailto:hardev@avloryn.com"
            className="mt-8 inline-block text-[1.05rem] font-[480] text-foreground underline decoration-border-strong decoration-1 underline-offset-[6px] transition-colors hover:decoration-foreground"
          >
            hardev@avloryn.com
          </motion.a>
        </motion.div>

        {/* form */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_SOFT}
          className="card-lux rounded-3xl p-7 sm:p-9"
        >
          <AnimatePresence mode="wait">
            {status === "success" ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex min-h-[22rem] flex-col items-center justify-center text-center"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-foreground text-background">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
                    <path d="M5 12l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <h3 className="mt-6 text-xl font-[540]">Message on its way</h3>
                <p className="mt-2 max-w-xs text-muted-foreground">
                  Thank you for reaching out — we&apos;ll be in touch shortly.
                </p>
                <button
                  type="button"
                  onClick={() => setStatus("idle")}
                  className="mt-6 text-[0.9rem] text-faint underline underline-offset-4 hover:text-foreground"
                >
                  Send another
                </button>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onSubmit={handleSubmit}
                noValidate
                className="flex flex-col gap-5"
              >
                {/* honeypot — hidden from humans, catches bots */}
                <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label htmlFor="cf-company">Company</label>
                  <input id="cf-company" name="company" type="text" tabIndex={-1} autoComplete="off" />
                </div>

                <Field label="Name" htmlFor="cf-name" error={errors.name}>
                  <input
                    id="cf-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    placeholder="Your name"
                    className={inputCls(!!errors.name)}
                  />
                </Field>

                <Field label="Email" htmlFor="cf-email" error={errors.email}>
                  <input
                    id="cf-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@email.com"
                    className={inputCls(!!errors.email)}
                  />
                </Field>

                <Field label="I'm reaching out about" htmlFor="cf-intent">
                  <div className="relative">
                    <select id="cf-intent" name="intent" className={inputCls(false) + " appearance-none pr-10"}>
                      <option value="early-access">A question about LivoDraft</option>
                      <option value="general">A general conversation</option>
                      <option value="partnership">Partnership or press</option>
                      <option value="other">Something else</option>
                    </select>
                    <svg
                      aria-hidden="true"
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-faint"
                      viewBox="0 0 24 24" width="16" height="16" fill="none"
                    >
                      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </Field>

                <Field label="Message" htmlFor="cf-message" error={errors.message}>
                  <textarea
                    id="cf-message"
                    name="message"
                    rows={4}
                    placeholder="Tell us a little about what you're looking for…"
                    className={inputCls(!!errors.message) + " resize-none"}
                  />
                </Field>

                <button
                  type="submit"
                  disabled={status === "submitting"}
                  className="group btn-gold mt-1 inline-flex h-[3.25rem] items-center justify-center gap-2 rounded-full px-7 text-[1rem] font-[500] transition-all duration-300 ease-premium hover:-translate-y-0.5 active:scale-[0.99] disabled:opacity-70"
                >
                  {status === "submitting" ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
                      Sending…
                    </>
                  ) : (
                    "Send message"
                  )}
                </button>

                {status === "error" && serverError && (
                  <p role="alert" className="text-[0.85rem] text-[hsl(var(--danger))]">
                    {serverError}
                  </p>
                )}
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-[0.85rem] font-[480] text-muted-foreground">
        {label}
      </label>
      {children}
      {error && (
        <p className="mt-1.5 text-[0.8rem] text-[hsl(var(--danger))]">{error}</p>
      )}
    </div>
  );
}

function inputCls(hasError: boolean) {
  return (
    // text-base (16px) is intentional: inputs under 16px make iOS Safari auto-zoom on focus.
    "w-full rounded-xl neu-inset px-4 py-3 text-base text-foreground placeholder:text-faint " +
    "transition-shadow duration-200 focus:outline-none focus:ring-2 focus:ring-gold/45 " +
    (hasError ? "ring-2 ring-[hsl(var(--danger))]" : "")
  );
}
