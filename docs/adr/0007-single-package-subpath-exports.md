# 0007. Single package with subpath exports

Status: Accepted · 2026-10-31

## Context

OpenPour has a core, one driver per brand and one transport per platform.
Users should load only what they import. No part has native code or its own
release cadence.

## Decision

Publish one `openpour` package with source under `src/` and subpath exports:
`openpour`, `openpour/acaia`, `openpour/transports/ble-plx` and
`openpour/transports/replay`. `react-native-ble-plx` is an optional peer
dependency, and the package sets `"sideEffects": false`.

## Consequences

- One version, one changelog, one CI; linking is trivial.
- Core users never install the React Native BLE library.
  − All parts share one version number.

Rejected: a pnpm monorepo of scoped packages (revisit when a transport needs
native code or its own release cadence).
