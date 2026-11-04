# AGENTS.md — OpenPour

Open-source (MIT) TypeScript library for Bluetooth coffee scales. It will be
public, so write everything here for outside contributors.

- What to work on next: `docs/roadmap.md`.
- Design and API: `docs/design.md`. Decisions: `docs/adr/README.md`. Code style: `docs/conventions.md`.
- OpenPour never performs I/O (ADR 0017). Sessions are synchronous: bytes and time in, events and commands out. No Bluetooth libraries, timers, clocks or async code anywhere in `src/`.
- Time is always passed in by the caller as `t`. Never read the clock.
- All of `src/` uses no platform APIs (no React Native, DOM or Node). There are no transports; the consuming app owns Bluetooth.
- Never reference any specific consuming app. Pour detection and recipes are out of scope.
- Every driver change needs a scrubbed fixture in `fixtures/<brand>/` and a replay test. Never commit raw captures.
- Clean room (ADR 0015): study public implementations for facts only, then write our own code. Never copy or adapt third-party code, and never name or link other implementations. Never commit vendor SDKs, firmware or decompiled code.
- Biome formats and lints. No enums, no default exports, explicit types on exports.
- Tuning values (windows, thresholds, intervals) are named constants.
- Conventional commits; releases are cut from them (ADR 0006).
