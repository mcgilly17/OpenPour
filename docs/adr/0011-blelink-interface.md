# 0011. BleLink and Transport interface

Status: Superseded by 0017 · 2026-10-31

## Context

Write/notify/close is not enough for Acaia. Old and new protocol variants are
only told apart by GATT discovery, a drop must be reported explicitly, and
commands and heartbeats use different write modes. Web Bluetooth only lets a
user pick a device after a tap. The published OpenPour protocol needs reads.

## Decision

- **BleLink:** `services()`, `read()`, `notify(svc, chr, fn)` (returns a
  promise of unsubscribe), `write(svc, chr, bytes, "response" | "noResponse")`,
  optional `requestMtu?()`, `onDisconnect(fn)`, `close()`.
- **Transport:** offers `scan?()` (native) and/or `pick?()` (Web Bluetooth,
  called from a user gesture).
- **Drivers:** each declares `namePrefixes` and `services`; `matches()` only
  refines a match.
- **Native protocol:** the OpenPour protocol is just another driver. BleLink
  must support every operation that protocol uses.

## Consequences

- **Pro:** Covers Acaia, Web Bluetooth and native OpenPour scales with no further link changes.
- **Con:** A bigger interface for each transport to implement.

Rejected: keeping three methods; adding methods only as each need arrives.
