import { LogoMark } from "@/components/ui/logo";

export const metadata = { title: "Book a meeting — Avloryn Labs", robots: { index: false, follow: false } };

export default function MeetIndex() {
  return (
    <main className="portal-light min-h-screen grid place-items-center px-5 py-12">
      <div className="w-full max-w-[440px] text-center">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <LogoMark size={32} />
          <div className="text-left">
            <div className="font-serif text-[18px] font-[600] leading-none">Avloryn <span className="text-gold">Labs</span></div>
            <div className="section-label mt-1.5">Scheduling</div>
          </div>
        </div>
        <div className="card-lux rounded-3xl p-7">
          <h1 className="font-serif text-[24px] font-[600] mb-2">You need a booking link</h1>
          <p className="text-[13px] text-muted-foreground">
            To schedule a meeting, please use the specific booking link shared with you by the Avloryn Labs team.
            Questions? <a href="mailto:contact@avloryn.com" className="text-gold font-semibold hover:underline">contact@avloryn.com</a>
          </p>
        </div>
      </div>
    </main>
  );
}
