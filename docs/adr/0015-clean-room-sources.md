# 0015. Clean-room protocol work

Status: Accepted · 2026-10-31 (decompiling: Open, deferred)

## Context

No vendor publishes its protocol. Public implementations exist, some under
copyleft licences; porting their code would force their licence onto OpenPour.

## Decision

- **Study, then rebuild:** study public implementations for protocol facts,
  then write our own, simpler code. No third-party code is copied or adapted.
- **Facts:** byte layouts and message types are recorded in `spec/<brand>.md`,
  each marked verified (with the fixture that proves it) or not yet verified.
- **Separation:** other implementations are never open alongside ours while we write.
- **No references:** the repo does not name or link other implementations.
- **Never:** vendor SDK code or firmware.

## Consequences

+ OpenPour stays MIT with no third-party code; every fact is tied to a fixture.
− Facts not yet verified on hardware carry no public source in the repo.
− **Open:** whether decompiling vendor apps is ever acceptable is deferred.
  It is not done, and our own captures cover the need.

Rejected: adapting MIT-licensed code with credit; own captures only.
