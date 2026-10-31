# 0010. Readings API: subscribe first

Status: Accepted · 2026-10-31

## Context

Scales push about 10 readings a second to several consumers at once (charts,
recorders, dual-scale pairing). An async iterable can't be shared, is awkward
to cancel from UI frameworks, and builds a backlog when a consumer is slow.

## Decision

- `scale.onReading(fn)` returns an unsubscribe function and is the main API.
- `scale.latest` holds the current reading.
- `scale.readings({ signal })` is an async-iterable helper built on
  `onReading`; it keeps only the newest value.
- Events use typed `on(name, fn)`: `state`, `disconnect`, `button`, `timer`.

## Consequences

- Fits effect cleanup; any number of consumers; zero dependencies.
- Matches the push model of every BLE API we wrap.
  − Stream composition (merge, throttle) is left to consumers.

Rejected: async iterable only; event emitter; RxJS observable; signals.
