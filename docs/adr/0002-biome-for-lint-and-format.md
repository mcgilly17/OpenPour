# 0002. Biome for lint and format

Status: Accepted · 2026-10-31

## Context

We need one lint and format tool that contributors can run without setup.
typescript-eslint cannot read TypeScript 7 until 7.1 ships its API.

## Decision

Biome 2.6 handles formatting and linting with a single `biome.json`.
CI runs `biome ci`.

## Consequences

- One dependency and one config, fast enough to run on every commit.
- Works with TypeScript 7 today.
  − Fewer rules than the ESLint plugin ecosystem.

Rejected: ESLint + Prettier.
