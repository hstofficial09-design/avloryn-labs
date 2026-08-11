"use client";
import { useState } from "react";

/**
 * A password field with a press-and-hold "eye" — hold the icon to reveal the
 * characters, release to hide again. Forwards every native input prop, so it's
 * a drop-in for `<input type="password" .../>`.
 */
export function PasswordInput({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  const reveal = () => setShow(true);
  const hide = () => setShow(false);
  return (
    <div className="relative">
      <input {...props} type={show ? "text" : "password"} className={className + " pr-11"} />
      <button
        type="button"
        tabIndex={-1}
        aria-label={show ? "Hide password" : "Show password"}
        title="Hold to show"
        onMouseDown={reveal}
        onMouseUp={hide}
        onMouseLeave={hide}
        onTouchStart={(e) => { e.preventDefault(); reveal(); }}
        onTouchEnd={hide}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 grid place-items-center w-7 h-7 rounded-lg text-faint hover:text-foreground transition-colors select-none"
      >
        {show ? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a18 18 0 0 1-2.16 3.19M6.6 6.6A18 18 0 0 0 2 12s3 8 10 8a9.1 9.1 0 0 0 5.4-1.6" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" /><circle cx="12" cy="12" r="3" /></svg>
        )}
      </button>
    </div>
  );
}
