"use client";
import { useRouter } from "next/navigation";

type Data = {
  employee: { id: string; name: string; emp_type: string; track: string | null; commission_pct: number };
  summary?: { orders: number; sales: number; earned: number; pending: number; paid: number };
  orders: { id: string; product: string; code: string | null; doc_ref: string | null; order_amount_inr: number; commission_pct: number; commission_inr: number; status: string; created_at: string }[];
};

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export default function EmployeeDashboard({ name, data, error }: { name: string; data: Data | null; error: string | null }) {
  const router = useRouter();
  async function logout() { await fetch("/api/portal/logout", { method: "POST" }); router.push("/portal/login"); }

  const s = data?.summary;
  const emp = data?.employee;
  const code = data?.orders?.find((o) => o.code)?.code;

  return (
    <main className="min-h-screen bg-[#FAF8F2] text-[#14110B] font-sans px-4 sm:px-6 py-6">
      <div className="max-w-[860px] mx-auto">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg grid place-items-center text-[#3a2e0c] font-serif font-bold" style={{ background: "linear-gradient(150deg,#E7D6A6,#C6A249 55%,#A9852F)" }}>A</div>
            <div><div className="font-serif text-[17px] font-bold leading-none">Avloryn <span className="text-[#A9852F]">Labs</span></div><div className="text-[10px] tracking-[0.14em] uppercase text-[#948c79] mt-0.5">Partner Portal</div></div>
          </div>
          <button onClick={logout} className="text-[12.5px] font-semibold text-[#3a352b] border border-[#E2DBCB] rounded-lg px-3 py-1.5 bg-white">Sign out</button>
        </header>

        <h1 className="font-serif text-[30px] font-bold mt-5 mb-1">Hi, {emp?.name || name} 👋</h1>
        <p className="text-[13.5px] text-[#6b6455] mb-5">Aapke code se hui har sale ka commission — product ke saath. Payout aapke bank mein.</p>

        {error ? (
          <div className="rounded-xl border border-[#eeddb0] bg-[#fdf5e3] text-[#946412] text-[13px] px-4 py-3">⚠ {error}</div>
        ) : !data ? (
          <div className="rounded-xl border border-[#E9E3D6] bg-white text-[#6b6455] text-[13px] px-4 py-4">
            Abhi tak koi commission record nahi. Jaise hi aapke code se sale hogi, yahan dikhegi.
          </div>
        ) : (
          <>
            {(emp || code) && (
              <div className="flex flex-wrap items-center gap-5 rounded-xl border border-[#E7D6A6] px-4 py-3.5 mb-5" style={{ background: "linear-gradient(120deg,#fff,#FBF6EA)" }}>
                {code && <div><div className="text-[11px] uppercase tracking-wide text-[#6b6455]">Your code</div><div className="font-mono text-[19px] font-extrabold text-[#A9852F]">{code}</div></div>}
                <div><div className="text-[11px] uppercase tracking-wide text-[#6b6455]">Your commission</div><div className="font-bold text-[#A9852F]">{emp?.commission_pct ?? 10}% of net sale</div></div>
                {emp && <div><div className="text-[11px] uppercase tracking-wide text-[#6b6455]">Role</div><div className="font-bold">{emp.emp_type === "intern" ? `Intern${emp.track ? " · " + emp.track : ""}` : "Employee"}</div></div>}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <Stat k="Commission earned" v={inr(s?.earned || 0)} tone="#A9852F" />
              <Stat k="Sales generated" v={inr(s?.sales || 0)} />
              <Stat k="Pending payout" v={inr(s?.pending || 0)} tone="#946412" />
              <Stat k="Paid to you" v={inr(s?.paid || 0)} tone="#1e7a44" />
            </div>

            <div className="rounded-2xl border border-[#E9E3D6] bg-white overflow-hidden shadow-[0_10px_30px_rgba(20,17,11,0.04)]">
              <div className="px-4 py-3 border-b border-[#E9E3D6]"><b className="font-serif text-[15px]">Your earnings</b></div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[620px]">
                  <thead><tr className="text-[11px] uppercase tracking-wide text-[#948c79] bg-[#fdfbf5]">
                    <Th>Date</Th><Th>Product</Th><Th>Document</Th><Th r>Sale (net)</Th><Th r>Your %</Th><Th r>Commission</Th><Th>Status</Th>
                  </tr></thead>
                  <tbody>
                    {data.orders.length === 0 && <tr><td colSpan={7} className="text-center text-[#948c79] py-5">No earnings yet.</td></tr>}
                    {data.orders.map((o) => (
                      <tr key={o.id} className="border-t border-[#E9E3D6]">
                        <td className="px-4 py-3">{(o.created_at || "").slice(0, 10)}</td>
                        <td className="px-4 py-3"><span className="inline-flex items-center gap-2 font-bold text-[12.5px]"><span className="w-2 h-2 rounded-full" style={{ background: "linear-gradient(150deg,#C6A249,#A9852F)" }} />{o.product}</span></td>
                        <td className="px-4 py-3 font-mono text-[12px]">{o.doc_ref}</td>
                        <td className="px-4 py-3 text-right font-mono">{inr(o.order_amount_inr)}</td>
                        <td className="px-4 py-3 text-right font-mono">{o.commission_pct}%</td>
                        <td className="px-4 py-3 text-right font-mono">{inr(o.commission_inr)}</td>
                        <td className="px-4 py-3">{o.status === "paid" ? <span className="text-[#1e7a44] font-bold">Paid</span> : <span className="text-[#946412] font-bold">Pending</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-center text-[12px] text-[#948c79] mt-4">Naye Avloryn products bhi yahin dikhenge — product-name ke saath. Payout bank mein aayega jab owner pay kare.</p>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return <div className="rounded-xl border border-[#E9E3D6] bg-white px-4 py-3.5"><div className="text-[11.5px] text-[#6b6455] mb-1.5">{k}</div><div className="text-[23px] font-extrabold font-mono tracking-tight" style={tone ? { color: tone } : {}}>{v}</div></div>;
}
function Th({ children, r }: { children: React.ReactNode; r?: boolean }) {
  return <th className={"font-bold px-4 py-2.5 " + (r ? "text-right" : "text-left")}>{children}</th>;
}
