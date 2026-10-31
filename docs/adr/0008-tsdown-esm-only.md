# 0008. tsdown, ESM-only

Status: Accepted · 2026-10-31

## Context

tsup is no longer maintained, and tsdown is its recognised successor. Metro,
browsers and every supported Node version consume ESM.

## Decision

- Build with tsdown: unbundled ESM, `.d.ts` files next to each `.js` file.
- `publint` and `attw` (esm-only profile) run on every build.
- A separate `tsc -b` check type-checks the code.
- `pnpm dev` runs `tsdown --watch`, so linked consumers use the same `dist/`
  that npm users get.

## Consequences

- **Pro:** Today's standard, fast, and catches broken `exports` maps.
- **Con:** tsdown is 0.x, so expect config churn.
- **Con:** No CommonJS output.

Rejected: plain `tsc` emit; dual ESM + CJS; a source export condition for
linked development.
