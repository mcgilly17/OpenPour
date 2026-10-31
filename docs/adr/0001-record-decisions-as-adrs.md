# 0001. Record decisions as ADRs

Status: Accepted · 2026-10-31

## Context

OpenPour will be public and maintained by people who weren't in the room.
Decisions written into chat or into long agent rule files get lost or ignored.

## Decision

Each architectural decision is one short file, `docs/adr/NNNN-title.md`
(Context, Decision, Consequences, Rejected), indexed in `docs/adr/README.md`.
Coding rules live in `docs/conventions.md`. `AGENTS.md` links to both and keeps
only hard rules. Accepted ADRs are never edited; a new ADR supersedes an old one.

## Consequences

- **Pro:** Contributors can see why things are the way they are.
- **Pro:** Agent rule files stay short.
- **Con:** One more file per decision.

Rejected: decisions inside AGENTS.md; a shared folder outside the repo.
