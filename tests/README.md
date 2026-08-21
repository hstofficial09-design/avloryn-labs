# Avloryn regression guards

Permanent guards that lock in every bug we've fixed, plus the invariants that stop whole CLASSES of
bug from coming back silently. **Run before every push:**

```
npm run guard
```

Nothing here touches a live database, a real calendar, or the network — the static guards read the
source, and the logic guards import the real decision functions and run them on made-up input.

| File | Guards against |
|---|---|
| `test_invariants.mjs` | **Static class-guard** — reads every API route and fails if a portal endpoint doesn't check the session, a scheduling *setup* endpoint isn't restricted to the owner/HR, a route that books or moves a meeting skips the clash check, the calendar sync stops deciding by modification time, an employee listing forgets to exclude deleted people, or PDF text bypasses `pdfSafe`. Catches a NEW endpoint that forgets a gate. |
| `test_wiring.mjs` | Dead buttons — every `/api/…` the frontend calls must exist as a real route file, and every internal page link must resolve to a page. |
| `test_logic.ts` | The decisions that move real things: which calendar copy wins a sync (the bug that undid a reschedule), on-time vs late, and how a tenure score is built. |

## The discipline (why tests alone aren't enough)

A test proves the case it checks; it cannot prove there are no other bugs. The ones that slip
through live in scenarios nobody thought to test. So for every fix:

1. Add a **regression test** here, so that exact bug cannot return.
2. Where the bug is one of a class, add a **rule to `test_invariants.mjs`** so the whole class is
   guarded — not the single instance you happened to find.
3. Think **adversarially**: not "does the happy path work", but "who could call this, and what
   would they get".

## The other half: the watchdog

These guards catch a mistake **while it is being written**. They cannot catch a thing that was
working and quietly stopped — a revoked Google grant, a cron that died, a leaver whose referral
code kept earning. Nothing on any screen changes when those happen, so nobody finds out for weeks.

That is what `lib/monitor/` is for. It runs hourly in production
(`.github/workflows/system-watch.yml` → `/api/cron/monitor`), checks both Avloryn and LivoDraft,
emails when something breaks, and puts a banner at the top of the portal that stays until the thing
actually passes again.

Two properties matter more than the checks themselves, and `R9` in `test_invariants.mjs` enforces
both:

- **It is read-only.** A monitor that can write is a bug factory running unattended against
  production. No writes, no sends, no bookings — it looks at state and never changes it.
- **It reports on silence.** A job that has stopped running cannot report its own failure, so every
  scheduled job records a heartbeat and the watchdog alerts on the *absence* of one. That is the
  only shape of check that would have caught the reminders cron sitting dead for weeks.

Alerting is throttled deliberately — first failure, then a day, three days, a week, each one saying
plainly that nobody has touched it. Emailing every failure every hour is how real alerts come to be
ignored, so `shouldAlert` is unit-tested in `test_logic.ts` rather than left to judgement.

## What is deliberately NOT here

Anything that needs a live Google/Zoho calendar or the production database. Those checks exist as
scripts run by hand against real accounts, because faking them would prove nothing about the APIs
they actually talk to. This suite is the part that must pass on every machine, every time.

## Hooks

Two hooks live in `tests/hooks/` and are installed into `.git/hooks` (git does not clone hooks, so
a fresh checkout needs one line):

```
cp tests/hooks/* .git/hooks/ && chmod +x .git/hooks/pre-commit .git/hooks/pre-push
```

- **pre-commit** — refuses to commit `.env.local` or anything that looks like a live credential.
  This repository is public: a key committed here is readable by everyone the moment it is pushed.
- **pre-push** — runs `npm run guard`, so a broken invariant can't leave the machine.

Both can be skipped with `--no-verify`. Skipping is a decision, not a shortcut.
