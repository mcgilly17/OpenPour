# 0004. Node 24 for development, CI matrix 22/24/26

Status: Accepted · 2026-10-31

## Context

Tooling runs on Node; Vitest 5 needs Node 22.12 or later. Node 26 became LTS
on 2026-10-28 and some tooling may not support it fully yet. Users run their
own Node versions.

## Decision

`.node-version` pins Node 24 for development and the main CI job. The test job
also runs on Node 22, 24 and 26. The package declares `engines.node >= 22`, the oldest version CI tests (Node 20 reached end of life in April 2026).

## Consequences

- **Pro:** Proven toolchain for day-to-day work; supported runtimes are covered by tests.
- **Con:** Moving development to Node 26 later is a separate step.

Rejected: Node 26 as the development default.
