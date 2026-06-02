import { NextStudio } from "next-sanity/studio";
import config from "@/sanity.config";
import { isSanityConfigured } from "@/sanity/env";
import { LogoMark } from "@/components/ui/logo";
import type { Metadata, Viewport } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Avloryn Studio",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function StudioPage() {
  // Until a real Sanity project id is set, mounting the Studio just throws a
  // CorsOriginError ("connect this studio"). Show clear setup steps instead.
  if (!isSanityConfigured) {
    return <StudioNotConnected />;
  }
  return <NextStudio config={config} />;
}

function StudioNotConnected() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 py-20">
      <div className="card-lux w-full max-w-xl rounded-3xl p-8 sm:p-10">
        <span className="inline-flex items-center gap-2.5 text-foreground">
          <LogoMark size={26} />
          <span className="text-[1.05rem] font-[560] tracking-[-0.02em]">Avloryn Studio</span>
        </span>

        <h1 className="mt-6 text-2xl font-[560] tracking-[-0.02em]">
          Connect your Sanity project
        </h1>
        <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
          The blog editor is built and ready — it just needs a Sanity project to write
          into. This is a one-time setup (takes ~3 minutes).
        </p>

        <ol className="mt-7 space-y-4 text-[0.96rem] leading-relaxed">
          <Step n={1}>
            Go to{" "}
            <a
              href="https://www.sanity.io/manage"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
            >
              sanity.io/manage
            </a>{" "}
            and create a free project named <strong className="text-foreground">Avloryn</strong>.
            Add a dataset called <code className="rounded bg-muted px-1.5 py-0.5">production</code> (public).
          </Step>
          <Step n={2}>
            Copy the <strong className="text-foreground">Project ID</strong> and put it in a{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">.env.local</code> file in the project root:
            <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-subtle p-3 text-[0.82rem] text-foreground">
{`NEXT_PUBLIC_SANITY_PROJECT_ID=your_project_id
NEXT_PUBLIC_SANITY_DATASET=production`}
            </pre>
          </Step>
          <Step n={3}>
            In the project&rsquo;s <strong className="text-foreground">API → CORS origins</strong>, add{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">http://localhost:3000</code> (allow
            credentials). Add your live domain later too.
          </Step>
          <Step n={4}>
            Restart the dev server (<code className="rounded bg-muted px-1.5 py-0.5">npm run dev</code>),
            then reload this page — the editor will open here.
          </Step>
        </ol>

        <a
          href="/"
          className="mt-8 inline-flex items-center gap-1.5 text-[0.9rem] text-muted-foreground transition-colors hover:text-foreground"
        >
          <span aria-hidden="true">←</span> Back to site
        </a>
      </div>
    </main>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground text-[0.78rem] font-[560] text-background">
        {n}
      </span>
      <span className="text-muted-foreground">{children}</span>
    </li>
  );
}
