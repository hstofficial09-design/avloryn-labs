import type { Metadata } from "next";
import { LegalShell } from "@/components/layout/legal-shell";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The terms that govern your use of the Avloryn Labs website.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Use" updated="June 2026">
      <p>
        These Terms of Use (&ldquo;Terms&rdquo;) govern your access to and use of the{" "}
        <strong>Avloryn Labs LLP</strong> website at{" "}
        <a href="https://avloryn.com">avloryn.com</a> (the &ldquo;Site&rdquo;). By using the
        Site, you agree to these Terms. If you do not agree, please do not use the Site.
      </p>

      <h2>About this Site</h2>
      <p>
        Avloryn Labs LLP is an early-stage product company. This Site is informational — it
        describes who we are, what we&rsquo;re building, and how to get in touch or request
        early access to our products, including <strong>Livodraft</strong> (live at
        livodraft.com). Access to any product is offered separately and may be subject to its own terms.
      </p>

      <h2>Acceptable use</h2>
      <p>When using the Site, you agree not to:</p>
      <ul>
        <li>Submit false, misleading, or unlawful information through our forms.</li>
        <li>Attempt to disrupt, probe, or gain unauthorized access to the Site or its systems.</li>
        <li>Use automated means to scrape or overload the Site.</li>
        <li>Infringe our or any third party&rsquo;s intellectual-property or other rights.</li>
      </ul>

      <h2>Early access &amp; waitlist</h2>
      <p>
        Joining a waitlist or requesting early access does not guarantee access, and invitations
        are extended at our discretion and in limited batches. We may change, pause, or
        discontinue any product or program at any time.
      </p>

      <h2>Intellectual property</h2>
      <p>
        The Avloryn name, logo, content, and design are owned by Avloryn Labs LLP and protected by
        applicable laws. You may not copy, reproduce, or use them without our prior written
        permission, except as allowed for ordinary, personal viewing of the Site.
      </p>

      <h2>No warranties</h2>
      <p>
        The Site is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without
        warranties of any kind, whether express or implied. We do not warrant that the Site will
        be uninterrupted, error-free, or free of harmful components.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Avloryn Labs LLP shall not be liable for any
        indirect, incidental, or consequential damages arising from your use of, or inability to
        use, the Site.
      </p>

      <h2>Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Continued use of the Site after changes
        take effect constitutes acceptance of the revised Terms. The &ldquo;last updated&rdquo;
        date above reflects the current version.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms? Write to{" "}
        <a href="mailto:hardev@avloryn.com">hardev@avloryn.com</a>.
      </p>
    </LegalShell>
  );
}
