import type { Metadata } from "next";
import { LegalShell } from "@/components/layout/legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Avloryn Labs collects, uses, and protects the information you share with us.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="June 2026">
      <p>
        This Privacy Policy explains how <strong>Avloryn Labs LLP</strong> (&ldquo;Avloryn,&rdquo;
        &ldquo;we,&rdquo; &ldquo;us&rdquo;) collects, uses, and protects information when you
        visit <a href="https://avloryn.com">avloryn.com</a> or contact us. We keep this simple
        on purpose: we collect as little as possible, and we never sell your data.
      </p>

      <h2>Information we collect</h2>
      <p>We only collect what you choose to give us:</p>
      <ul>
        <li>
          <strong>Contact &amp; early-access details</strong> — your name, email address, the
          reason you&rsquo;re reaching out, and any message you send through our form.
        </li>
        <li>
          <strong>Basic usage analytics</strong> — we use Google Analytics 4 to understand, in
          aggregate, how the Site is used (such as page views, referrers, and approximate
          location). Analytics cookies are set <em>only if you accept</em> them via our cookie
          banner; if you decline, no analytics cookies are stored on your device. IP addresses
          are anonymised, and we do not use this data to identify you personally. You can change
          your choice at any time by clearing the Site&rsquo;s cookies in your browser.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To respond to your message and, where relevant, to add you to the LivoDraft updates list.</li>
        <li>To send you product updates or an invitation when access opens — only in connection with your request.</li>
        <li>To understand, in aggregate, how the site is used so we can improve it.</li>
      </ul>

      <h2>What we do not do</h2>
      <ul>
        <li>We do not sell, rent, or trade your personal information.</li>
        <li>We do not use your details for unrelated advertising.</li>
        <li>We do not collect more than we need.</li>
      </ul>

      <h2>How your data is stored</h2>
      <p>
        Waitlist and contact submissions are stored with our infrastructure providers
        (including Supabase for the database and Resend for email delivery) under their
        respective security and data-processing terms. We restrict access to this information
        to people who need it to operate Avloryn.
      </p>

      <h2>Your choices</h2>
      <p>
        You can ask us to access, correct, or delete the information you&rsquo;ve shared at any
        time. To do so, email{" "}
        <a href="mailto:care@avloryn.com">care@avloryn.com</a> and we&rsquo;ll act on your
        request promptly.
      </p>

      <h2>Children</h2>
      <p>
        Avloryn is intended for users aged 16 and above. We do not knowingly collect
        information from children under that age.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy as the product evolves. When we do, we&rsquo;ll revise the
        &ldquo;last updated&rdquo; date above. Material changes will be communicated where
        appropriate.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about your privacy? Write to{" "}
        <a href="mailto:care@avloryn.com">care@avloryn.com</a>.
      </p>
    </LegalShell>
  );
}
