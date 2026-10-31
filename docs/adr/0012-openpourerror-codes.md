# 0012. One error type with codes

Status: Accepted · 2026-10-31

## Context

Consumers must tell failures apart to show the right message or retry.
`instanceof` checks on subclasses break when two copies of the package are
installed. A BLE operation with no timeout can hang forever.

## Decision

Every failure is an `OpenPourError` with a `code` (`unsupported`,
`disconnected`, `timeout`, `not-found`, `unknown-device`, `permission`, `busy`
or `protocol`) and the original `cause`. Every awaited BLE operation has a
timeout.

## Consequences

- **Pro:** Reliable checks across duplicate installs; easy to map to UI text.
- **Con:** A new code is a public API change and needs a release note.

Rejected: error subclasses; result values instead of throws.
