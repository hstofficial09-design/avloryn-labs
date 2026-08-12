import type { ReactNode } from "react";

interface Social {
  label: string;
  href: string;
  icon: ReactNode;
}

// Only platforms that actually exist. Add more here as profiles are created.
const SOCIALS: Social[] = [
  {
    label: "Email",
    href: "mailto:contact@avloryn.com",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </>
    ),
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/124884054/",
    icon: (
      <path
        fill="currentColor"
        d="M6.94 8.5H4.3V19h2.64zM5.62 4.3a1.53 1.53 0 1 0 0 3.06 1.53 1.53 0 0 0 0-3.06M19.7 19h-2.63v-5.5c0-1.38-.5-2.32-1.73-2.32-.94 0-1.5.63-1.75 1.25-.09.22-.11.52-.11.83V19H10.8s.04-9.5 0-10.5h2.64v1.49c.35-.54.98-1.31 2.38-1.31 1.74 0 3.04 1.13 3.04 3.57z"
      />
    ),
  },
  {
    label: "X",
    href: "https://x.com/AvlorynLabs",
    icon: (
      <path
        fill="currentColor"
        d="M17.3 4h2.9l-6.36 7.27L21.5 20h-5.84l-4.58-5.86L5.84 20H2.94l6.8-7.78L2.5 4h6l4.13 5.36zm-1.02 14.27h1.6L8.2 5.65H6.5z"
      />
    ),
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/avloryn_labs/",
    icon: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="16.6" cy="7.4" r="1.1" fill="currentColor" />
      </>
    ),
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/channel/UCfuyB0d1ilYkoUjlSJklq7w",
    icon: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M11 9.5v5l4-2.5z" fill="currentColor" />
      </>
    ),
  },
  {
    label: "Facebook",
    href: "https://www.facebook.com/profile.php?id=61590542071920",
    icon: (
      <path
        fill="currentColor"
        d="M13.5 21v-7h2.3l.4-2.8h-2.7V9.4c0-.8.23-1.36 1.4-1.36h1.4V5.5a19 19 0 0 0-2.1-.11c-2.07 0-3.5 1.27-3.5 3.6v2.2H8.4V14h2.2v7z"
      />
    ),
  },
];

export function Socials() {
  return (
    <ul className="flex flex-wrap gap-2.5">
      {SOCIALS.map((s) => {
        const external = !s.href.startsWith("mailto:");
        return (
          <li key={s.label}>
            <a
              href={s.href}
              aria-label={s.label}
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-all duration-300 ease-premium hover:-translate-y-0.5 hover:border-border-strong hover:text-foreground hover:shadow-soft"
            >
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true">
                {s.icon}
              </svg>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
