"use client";

import { useState } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Status = "idle" | "submitting" | "success" | "error";

export function Subscribe() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const email = (data.get("email") as string)?.trim();

    if (!email || !EMAIL_RE.test(email)) {
      setError("Please enter a valid email.");
      setStatus("error");
      return;
    }

    setStatus("submitting");
    setError("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, company: (data.get("company") as string) || "" }),
      });
      const json = (await res.json().catch(() => ({ ok: false }))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("success");
      form.reset();
    } catch {
      setError("Network error — please try again.");
      setStatus("error");
    }
  }

  return (
    <section className="card-lux rounded-3xl p-8 text-center sm:p-10">
      {status === "success" ? (
        <div className="flex flex-col items-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-foreground text-background">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
              <path d="M5 12l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h3 className="mt-5 text-xl font-[540]">You&apos;re on the list</h3>
          <p className="mt-2 max-w-sm text-muted-foreground">
            Thanks for subscribing — we&apos;ll send new writing your way, never spam.
          </p>
        </div>
      ) : (
        <>
          <h3 className="text-[1.5rem] font-[560] tracking-[-0.02em]">
            Get new writing in your inbox
          </h3>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            Occasional notes on building intelligent software. No noise.
          </p>
          <form
            onSubmit={onSubmit}
            noValidate
            className="mx-auto mt-6 flex max-w-md flex-col gap-3 sm:flex-row"
          >
            {/* honeypot */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label htmlFor="sub-company">Company</label>
              <input id="sub-company" name="company" type="text" tabIndex={-1} autoComplete="off" />
            </div>

            <label htmlFor="sub-email" className="sr-only">
              Email address
            </label>
            <input
              id="sub-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@email.com"
              className="neu-inset h-12 flex-1 rounded-full px-5 text-base text-foreground placeholder:text-faint transition-shadow focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
            <button
              type="submit"
              disabled={status === "submitting"}
              className="btn-gold inline-flex h-12 items-center justify-center rounded-full px-6 text-[0.95rem] font-[500] transition-all duration-300 ease-premium hover:-translate-y-0.5 active:scale-[0.99] disabled:opacity-70"
            >
              {status === "submitting" ? "Subscribing…" : "Subscribe"}
            </button>
          </form>
          {status === "error" && error && (
            <p role="alert" className="mt-3 text-[0.85rem] text-[hsl(var(--danger))]">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
