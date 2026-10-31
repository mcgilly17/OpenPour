# 0009. Platform-free core, enforced by the compiler

Status: Accepted · 2026-10-31

## Context

Core and drivers must run on phones, browsers and Node (tests, CLIs).
A written rule alone gets broken by accident. Timers and high-resolution
time are platform APIs, not plain JavaScript.

## Decision

- **Core project:** `tsconfig.core.json` covers `src/core`, `src/drivers` and
  `src/transports/replay`, with `lib: ["ES2023"]` and `types: []`. It is
  composite, so importing a transport fails the build.
- **Transports project:** `tsconfig.transports.json` references core and adds
  the platform types each transport needs.
- **Clock:** time and timers come from an injected
  `Clock { now, setTimeout, clearTimeout }`.

## Consequences

- Platform leaks are build errors, not review comments.
- The injected Clock makes replay tests instant and deterministic.
  − Two tsconfig projects to maintain.

Rejected: a lint rule only; convention plus review.
