# Roadmap

What's done and what's next for OpenPour. Task numbers are stable, so
commits, docs and tests can refer to them.

## How to use this file

1. Pick the first unchecked task whose `needs:` are all checked.
2. One task = one commit or PR. Tick the box in the same commit.
3. **🧑 tasks** need a person with the hardware. Don't fake them.
4. **DECISION tasks:** write a short proposal in `docs/adr/` (options,
   trade-off, recommendation) and wait for a maintainer to choose.
5. If a task turns out too big, split it here before starting.
6. "Done when" is the bar. `pnpm validate` must pass.

## Where things stand

The library is usable for the **Acaia Pearl S** (2022, firmware 1.0.8) and
**Lunar** (AL008, firmware 1.0.019): connection handshake, heartbeat,
readings in the scale's own unit with stable flag and flow, tare, timer
commands and events, button events, battery and scale info. Both were run
through the web harness on real hardware, with recordings committed in
`fixtures/acaia/`. They have not yet been through the formal checks
(`docs/checks.md`), so their support is not yet listed as verified.

Known gaps:

- After a unit switch on a Lunar, readings may stay held until reconnect;
  whether the Lunar answers a settings request is unconfirmed (1.5d).
- Settings (units, sound, auto-off…) can be read but not written (1.4c).
- The Pearl S sends no button events.

## The three contributor workflows

The harness and contributor guide support these starting points:

| Workflow                      | Starting point                                                     | Result                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Check a supported scale       | A driver already verified for some models and firmware             | A repeatable compatibility report for this model and firmware, plus recordings for any regressions               |
| Validate a provisional driver | A driver based on protocol research; Acaia is the first case       | Physical observations tied to captures, verified capabilities, and regression tests                              |
| Add an unknown scale          | No matching driver, or a protocol variant the driver cannot decode | GATT and traffic inspection, captures, protocol facts, then a new or extended driver run through the same checks |

The contributor journey: clone → `pnpm install` → `pnpm harness` → choose a
workflow → connect and inspect → run checks and record → replay and implement
or fix the driver → submit evidence. Contributors need no consuming app,
account or Nix installation.

Recorded bytes make a result reproducible; comparison with the physical scale
establishes correctness. A successful write, a decoded event or a passing
synthetic test alone cannot establish hardware support. Model, model year and
firmware coverage stay explicit; an untested variant stays unverified.

## Done

- [x] **0.2** Package skeleton: strict TypeScript, Vitest, Biome.
- [x] **0.4** CI quality-checks job running `pnpm validate` on every push and
  pull request.
- [x] **1.2** Core types for the sans-I/O API (ADR 0017).
- [x] **1.3** Flow filter: least-squares slope over a window, plus a deadband.
- [x] **1.4a** Public replay helper (`openpour/replay`).
- [x] **1.5a** Acaia frame codec, with a property test for split, merged and
  garbage-prefixed frames.
- [x] **1.5c** Acaia fixes from the first hardware recordings (ADR 0019):
  readings in the scale's unit and decimals, unit-switch handling, flow per
  unit, settled bit, timer events from timer values, `info` event.
- [x] **1.6** Acaia session state machine: handshake, heartbeat, tare and
  timer commands.
- [x] **1.9** Live web harness foundation (Web Bluetooth, runner, recorder,
  fixture export, session start in fixtures).
- [x] **1.9a.1** Inspector for a connected scale: kept recordings, raw tx/rx
  beside decoded events, frame comparison, listen-only connection, on-demand
  commands, saved scales, "Investigate a setting" wizard.

## Next

- [ ] **1.9a.1-fixes** Remaining review fixes from the 1.9a.1 review round.
- [ ] **1.9a.2** Unknown devices in the web harness. Choose a device by
  name prefix and service UUIDs, show discovered services and characteristic
  properties, read and subscribe to readable/notifiable characteristics, and
  record without a decoder. Unknown or non-driver services are read-only by
  default: writing needs an explicit, clearly warned opt-in per
  characteristic, because modules expose configuration or update services
  (e.g. the BM70's `49535343-c9d0-…` on the Pearl S) where a stray write can
  damage a scale. Explain the browser's service-access limits and point to
  the Node inspector. _Done when_ a synthetic unknown device can be inspected
  and recorded without selecting or changing a brand driver. needs: 1.9a.1
- [ ] **1.4b** `import-capture` script: converts PacketLogger or btsnoop
  captures to scrubbed fixtures (ADR 0013) using tshark. Select only the
  intended scale's services and characteristics; preserve packet boundaries,
  direction and timing; mask identifying payloads. Explain missing tools,
  ambiguous device selection and empty captures. Route the harness's fixture
  export through the same `scrub()` hook. _Done when_ conversion and
  scrubbing have tests, exported fixtures parse with `parseFixture`, and a CI
  check rejects MAC-shaped strings, invalid headers and committed raw
  captures. needs: 1.4a
- [ ] **1.4c** 🧑 Capture the Acaia app writing each setting (sound,
  auto-off, units, max weight, touch, mode) on the Pearl S and Lunar, one
  setting per trace (iPhone PacketLogger or Android HCI snoop). Raw traces
  stay local. _Done when_ each setting's write command is decoded in
  `docs/design.md`, so setting it can become a driver command. needs: 1.4b
- [ ] **1.5d** 🧑 Record a Lunar answering a settings request: connect,
  press Battery in the harness about 5 s later, then switch units on the
  scale and keep recording for 10 s. _Done when_ the recording shows whether
  the Lunar replies to `getSettings` and whether its reply reports the new
  unit, and `docs/design.md` says so. needs: 1.5c
- [ ] **1.9b** Guided verification in the web harness, with shared check
  definitions and an exportable report.
  - Offer the three workflows. Show live weight and flow, a weight/flow plot,
    timer, battery, a physical-button log and controls for declared
    capabilities. Show sample rate and notification gaps.
  - Implement the checks in `docs/checks.md` (C1–C18), keeping their IDs.
    Each records `pass`, `fail`, `unverified` or `unsupported`, expected and
    observed behaviour, fixture/time range and notes. The report carries
    OpenPour version, adapter, OS, browser and timestamp source, outside the
    fixture header. Untested checks start unverified.
  - Define expected behaviour and tolerances before evaluating. Weight uses
    the scale's resolution; flow and timing use named constants. Separate
    physical observations from automatic checks.
  - Compare computed flow with the observed weight change over a timed
    steady pour; check it settles after the pour and resets on tare.
  - Include a two-scale check: one scale disconnecting must not stop the
    other.
  - _Done when_ fake-source tests exercise reporting and export for each
    outcome, and a contributor can complete the checklist and export a
    report linked to parseable recordings. needs: 1.9a
- [ ] **1.10** Live Node harness using noble, reusing the web harness's
  runner, recorder, checks and report format. _Done when_ the Node glue
  passes the same command-loop contract, both front ends produce equivalent
  records and check outcomes for the same inputs, and the terminal route is
  documented for contributors who can't use Web Bluetooth. needs: 1.9b
- [ ] **1.11** `docs/testing-your-scale.md` and a driver submission
  checklist for outside contributors: each workflow from a clean clone with
  exact commands, prerequisites and troubleshooting; the clean-room rules for
  unknown scales; both capture paths, naming, scrubbing and fixture/report
  linkage; the evidence a submission needs. _Done when_ the documented
  commands run against a synthetic source from a clean checkout without Nix
  or a consuming app. needs: 1.4b, 1.10
- [ ] **1.1** 🧑 Follow the contributor guide on the Pearl S and Lunar:
  vendor-app capture (via 1.4b) and OpenPour through the harness, each scale
  alone and both together. Record model year and firmware, and every unclear
  step in the guide. _Done when_ scrubbed fixtures and check reports for each
  scale are committed and onboarding problems are recorded. needs: 1.4b,
  1.9b, 1.11
- [ ] **1.5b** Verify the codec and session against the 1.1 evidence:
  replay vendor-app and OpenPour captures, compare decoded results with the
  physical observations and replayed writes with the recorded tx (bytes and
  order exactly, time within a named tolerance — browser timers fire late
  and drift). The fixtures from 1.5c predate the info wait, so re-record
  them or compare from the first heartbeat on. `spec/acaia.md` ties each
  verified fact to its fixture. _Done when_ both scales pass connection,
  streaming, weight, tare and timer checks on hardware with replay tests.
  needs: 1.1
- [ ] **1.8** Reconcile `docs/design.md`, `spec/acaia.md` and a
  model/firmware compatibility table with the verified results, and correct
  the contributor guide from the 1.1 findings. _Done when_ a contributor can
  see what was tested, find its evidence and reproduce the checks.
  needs: 1.5b, 1.11

## Later

- Settings writes as driver commands, once 1.4c decodes them.
- More brands, through the "add an unknown scale" workflow.
- Publish to npm (releases are cut from conventional commits, ADR 0006).
- A native Swift binding would be separately scoped work.
