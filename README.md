# Cheffy

> Everything you make deserves to be remembered.

A social food diary for what you cook, bake and pour. Photograph it, rate it
0–10, write a few words, and it lands in your personal ranking. Friends see it,
like it, comment, and get ideas for what to make next.

Built with Expo SDK 58 (React Native 0.88, TypeScript strict), Expo Router,
TanStack Query, Supabase (Postgres + Auth + Storage + Row Level Security).

## Quick start

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in your Supabase URL and anon key (see SETUP.md), then:

```bash
npm run ios
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run ios` | Dev server + iOS simulator (Expo Go) |
| `npm run typecheck` | TypeScript, strict |
| `npm run lint` | ESLint incl. React Compiler rules |
| `npm run test:app` | Unit + component tests |
| `npm run test:db` | Runs the real migrations in PGlite and tests RLS, rankings, feed |
| `npm run check` | All of the above |

## Docs

- [PRODUCT_SPEC.md](PRODUCT_SPEC.md): what we're building and why
- [ARCHITECTURE.md](ARCHITECTURE.md): how it fits together
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md): tables, RLS, RPCs, storage
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md): tokens and components
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): milestones
- [PROGRESS.md](PROGRESS.md): status, verification and open items
- [SETUP.md](SETUP.md): Supabase, two-phone testing, TestFlight
- [docs/ACCEPTANCE_TEST.md](docs/ACCEPTANCE_TEST.md): the two-device test
