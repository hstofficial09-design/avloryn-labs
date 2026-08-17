"use client";
import { LogoMark } from "@/components/ui/logo";
import WorkLog from "../WorkLog";

const GHOST = "rounded-full bg-card ring-hairline hover:bg-muted text-foreground font-[520] transition-colors";

export default function WorkLogPage({ owner, name }: { owner: boolean; name: string }) {
  return (
    <div className="max-w-[980px] mx-auto px-4 sm:px-6 py-8">
      <header className="flex items-center justify-between gap-3 flex-wrap mb-7">
        <div className="flex items-center gap-3">
          <LogoMark size={30} />
          <div>
            <div className="font-serif text-[17px] font-[600] leading-none">Avloryn <span className="text-gold">Labs</span></div>
            <div className="section-label mt-1">{owner ? "Tasks & Reviews" : "Work Log"}</div>
          </div>
        </div>
        <a href="/portal" className={GHOST + " text-[12.5px] px-3.5 py-1.5"}>← Home</a>
      </header>

      <h1 className="font-serif text-[27px] font-[600] tracking-[-0.01em] mb-1.5">
        {owner ? "Tasks & reviews" : `Your work log, ${name.split(" ")[0]}`}
      </h1>
      <p className="text-[13px] text-muted-foreground mb-2 max-w-[64ch]">
        {owner
          ? "Everything you've asked of each person, when it was due, and whether it landed on time — with a weekly score that sits on top of those numbers rather than a memory of the week."
          : "Write down what you're working on. Every entry keeps its date and time, so at the end you have a complete record of what you did here — yours to download whenever you want."}
      </p>

      <WorkLog mode={owner ? "owner" : "employee"} />
    </div>
  );
}
