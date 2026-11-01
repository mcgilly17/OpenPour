# 0018. Session start in fixture headers

Status: Accepted · 2026-11-01

## Context

A session times its own writes from `session.start`: the settle delay before
identifying, then every heartbeat. Subscribing isn't a packet, so the first
record of a live recording is a write made some time after the start, about
100 ms later for Acaia. Replay started the session at the first record, so
every self-timed write came out late by that gap, and a heartbeat near the end
of a recording fell after the last record and went missing. Decoded events
still matched, but session writes could not be compared with the recorded `tx`
lines.

## Decision

Amends 0013. The header gains one optional field, `sessionStartT`: when
`session.start` was called, in ms on the records' time base. It must be a
finite number, no later than the first record's `t`. Replay starts the session
at `sessionStartT` when the header has it, and otherwise at the first record (0
for a fixture with no records), as before. Tools that record live sessions
write it. Imported captures leave it out when the start isn't known.

## Consequences

- **Pro:** Replayed writes match the recorded `tx` lines in bytes and time, so they can be compared exactly.
- **Pro:** Optional, so existing fixtures and imported captures parse and replay unchanged.
- **Con:** A write the radio held back, for example behind a slow subscription, still replays at the time the session asked for it, not the time it was sent.

Rejected: a start line among the records (every line after the header is a
packet); shifting record times so the session starts at 0 (breaks the shared
time base that lines up two scales in one recording); always starting replay
at 0 (imported captures don't begin at the session start).
