"use client";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/ui/logo";

export default function ConnectedPage() {
  const [status, setStatus] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setStatus(p.get("status") || "error");
    setEmail(p.get("email") || "");
  }, []);

  const ok = status === "ok";
  const denied = status === "denied";

  return (
    <main className="portal-light min-h-screen grid place-items-center px-5 py-12">
      <div className="w-full max-w-[420px]">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <LogoMark size={32} />
          <div>
            <div className="font-serif text-[18px] font-[600] leading-none">Avloryn <span className="text-gold">Labs</span></div>
            <div className="section-label mt-1.5">Calendar connection</div>
          </div>
        </div>
        <div className="card-lux rounded-3xl p-7 text-center">
          {status === "" ? (
            <p className="text-[13px] text-muted-foreground py-6">Finishing up…</p>
          ) : ok ? (
            <>
              <div className="mx-auto mb-4 grid place-items-center w-14 h-14 rounded-full neu-chip text-gold text-[26px]">✓</div>
              <h1 className="font-serif text-[24px] font-[600] mb-1.5">Calendar connected</h1>
              <p className="text-[13px] text-muted-foreground">
                {email ? <><b className="text-foreground/80">{email}</b> is now linked. </> : "Your Google Calendar is now linked. "}
                Your availability and Meet links will work automatically. You can close this tab.
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto mb-4 grid place-items-center w-14 h-14 rounded-full neu-chip text-[#b3341f] text-[24px]">!</div>
              <h1 className="font-serif text-[24px] font-[600] mb-1.5">{denied ? "Connection cancelled" : "Something went wrong"}</h1>
              <p className="text-[13px] text-muted-foreground">
                {denied ? "You didn't grant calendar access. " : "We couldn't complete the connection. "}
                Please open your connect link again, or ask the organizer to re-send it.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
