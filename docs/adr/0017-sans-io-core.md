# 0017. Sans-I/O core

Status: Accepted · 2026-10-31

## Context

OpenPour's value is the scale language: frames, handshakes, heartbeats and
flow. Driving the radio through an adapter tied it to Bluetooth libraries,
async calls and timers, and every platform needed its own transport.

## Decision

OpenPour never performs I/O. A driver turns the discovered GATT layout into a
session, and a session is a synchronous state machine:

- `Driver { brand, namePrefixes, services, matches?, createSession(gatt) }`;
  `gatt` (discovered services and characteristics) picks the protocol variant.
- `ScaleSession { info, capabilities, start(t), receive(chr, bytes, t), tick(t),
  tare(t), timer.start/stop/reset(t), requestBattery(t) }`, each returning
  `Step { events, commands, wakeAt? }`.
- `Command` is `subscribe`, `write { svc, chr, bytes, mode }` or `read`.
  `ScaleEvent` is `reading`, `battery`, `button`, `timer`, `state` or `error`.
- Time `t` always comes from the caller: arrival time, ideally stamped natively.
  No Clock, no timers and no async code in OpenPour.
- The consuming app owns all Bluetooth: library, permissions, scanning,
  connection, reconnect policy, running commands, calling `tick` at `wakeAt`,
  and fanning events out to its own consumers.

Supersedes 0010 and 0011, and the Clock part of 0009.

## Consequences

- **Pro:** no I/O, async code or peer dependencies; deterministic tests; any BLE library works.
- **Con:** each app writes about 50 lines of glue. An optional runner helper may be added later, only if adopters need it.
- **Also changes 0007:** no `transports/*` subpaths and no `react-native-ble-plx` peer dependency; `openpour/replay` feeds fixtures into a session.
- **Also changes 0009:** with no transports, one `tsconfig.json` (`lib: ["ES2023"]`, `types: []`) covers all of `src/`; the split core/transports projects go.
- **Also changes 0012:** per-operation BLE timeouts move to the app; OpenPour reports protocol timeouts (e.g. a missed heartbeat reply) as `error` events from `tick`. The connection codes (`disconnected`, `not-found`, `permission`, `busy`) leave OpenPour, leaving `unsupported`, `timeout`, `unknown-device` and `protocol`.
- **Also changes 0013:** `dir: "tx"` lines are what the session's commands must produce.
- **Also changes 0014:** replay feeds `receive` with recorded `t`; fake timers are not needed.

Rejected: OpenPour driving a BleLink adapter.
