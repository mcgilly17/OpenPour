# 0003. TypeScript 7 with isolatedDeclarations

Status: Accepted · 2026-10-31

## Context

TypeScript 7 (the native compiler) is about 10x faster. OpenPour has few tools
that depend on the TypeScript API, so the 7.0 API gap is low risk here.
Published `.d.ts` files must be simple and reliable for every consumer.

## Decision

Use TypeScript 7 with `strict` and `isolatedDeclarations: true`, so every
exported function and value has an explicit type.

## Consequences

- Fast type checks; declarations can be emitted without the type checker (ADR 0008).
- Consumers on any TypeScript version read the plain `.d.ts` output.
  − Explicit return types on every export.

Rejected: staying on TypeScript 6; inferred export types.
