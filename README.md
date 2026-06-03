# Avloryn Labs — Website

A premium marketing site for **Avloryn Labs**, an early-stage product company building
intelligent software that works the way people do. Currently featuring **Livodraft (Private Beta)**.

Built as a completely standalone project — it does not touch or depend on any other
codebase on this machine.

## Stack

- **Next.js 14** (App Router) + **React 18**
- **TypeScript**
- **Tailwind CSS 3** (custom design tokens, class-based dark mode)
- **Framer Motion** (scroll reveals, parallax, page transitions)
- Zero UI dependencies beyond the above — all components are hand-built.

## Getting started

```bash
cd avloryn-labs
npm install
npm run dev          # http://localhost:3000
```

Other scripts:

```bash
npm run build        # production build
npm run start        # serve the production build
npm run lint         # eslint
```

## Project structure

```
app/
  layout.tsx          Root layout — fonts, SEO metadata, JSON-LD, theme bootstrap
  page.tsx            Composes the full one-page site
  globals.css         Design tokens (light/dark) + base styles + utilities
components/
  providers/          ThemeProvider (class-based dark mode, localStorage)
  layout/             Navbar, Footer, Preloader, ScrollProgress
  sections/           Hero, Philosophy, Product, Vision, Values, Story, Contact
  ui/                 Button, Magnetic, Reveal, ThemeToggle, Logo, SectionHeading
lib/
  motion.ts           Shared Framer Motion variants + easing
  nav.ts              Navigation + section ids
  utils.ts            cn() class combiner
```

## Design system

All colors are CSS custom properties (HSL channels) in `app/globals.css`, exposed to
Tailwind in `tailwind.config.ts`. Use semantic classes everywhere:

`bg-background` · `text-foreground` · `text-muted-foreground` · `bg-subtle` ·
`bg-card` · `border-border` · `text-accent`

**Dark mode** is class-based (`<html class="dark">`). The toggle persists to
`localStorage` and an inline script in `layout.tsx` applies the saved theme before
paint to prevent any flash.

Typography: **Inter** (UI) and **Instrument Serif** (editorial accents), loaded via
`next/font` for zero layout shift.

## Accessibility & performance

- Semantic landmarks, labelled controls, visible focus rings, skip-friendly anchors.
- All motion respects `prefers-reduced-motion`.
- Fonts self-hosted via `next/font`; images are inline SVG (no external requests).
- SEO: full Open Graph / Twitter metadata + `Organization` JSON-LD.

## Wiring the contact form

The contact form in `components/sections/contact.tsx` validates on the client and
currently **simulates** submission. To make it live, replace the `setTimeout` in
`handleSubmit` with a real request, e.g.:

```ts
await fetch("/api/contact", { method: "POST", body: data });
```

Then add a route handler (`app/api/contact/route.ts`) that forwards to email
(Resend, Formspree, etc.). Social links in `components/sections/socials.tsx` are
placeholders — update the handles before launch.

## Deploy

Hosted on **Netlify** (site `avloryn-labs`) with CI/CD: every push to `main` on the
GitHub repo auto-builds and deploys via `@netlify/plugin-nextjs`. Do **not** use
`netlify deploy --build` (manual CLI 404s this Next 16 app). Server env vars (Supabase,
Resend, Sanity) are set in the Netlify site settings.

---

© Avloryn Labs · Building products for people.
