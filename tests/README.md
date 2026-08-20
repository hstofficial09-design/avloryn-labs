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
