# 0016. Coding conventions

Status: Accepted · 2026-10-31

## Context

Outside contributors need one clear, checkable style. Most of it should be
enforced by tools rather than review.

## Decision

Follow [`docs/conventions.md`](../conventions.md): naming, type rules (string
unions instead of enums, explicit export types, `unknown` at boundaries, no
non-null `!`, `interface` vs `type`, units in names), named exports only, and
co-located tests.

## Consequences

- A consistent codebase, mostly enforced by Biome and the compiler.
  − Two rules (interface vs type, units in names) rely on review.

Rejected: a lighter, tool-only set; default exports; `__tests__` folders.
