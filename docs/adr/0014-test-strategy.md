# 0014. Test strategy

Status: Accepted · 2026-10-31

## Context

Bugs appear in three places: frame splitting, decoding, and the flow filter
on noisy signals. Replay must be deterministic and fast.

## Decision

- **Runner:** Vitest 5.
- **Replay:** fixtures play through the replay link on the injected Clock
  (ADR 0009) with `vi` fake timers; decoded output is checked against file
  snapshots.
- **Flow filter:** hand-written cases for a steady pour, no pour, noise and a
  tare step.
- **Framing:** fast-check property tests for split, merged and corrupt frames
  and for resync.
- **Coverage:** v8, 90% lines and 85% branches on `core/` and `drivers/` only.

## Consequences

- Tests focus where bugs actually happen; runs are instant and repeatable.
  − fast-check is one extra dev dependency.

Rejected: wall-clock replay; no coverage gate; hand-written split cases only.
