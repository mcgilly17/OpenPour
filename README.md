# OpenPour

One API for Bluetooth coffee scales. MIT licensed.

OpenPour translates a scale's Bluetooth protocol into readings and commands. It
never touches Bluetooth itself: your app scans, connects and moves the bytes,
and hands each notification to an OpenPour session with the time it arrived.
The session hands back events (weight, flow, tare, timer, buttons, battery)
and the commands to send. That keeps it small, synchronous and usable from
React Native, the browser or Node.

```sh
npm install openpour
```

Entry points: `openpour` (core types, flow filter, errors), `openpour/acaia`
(the Acaia driver) and `openpour/replay` (feeds recorded fixtures into a
session, for tests).

## Status: 0.x

The API may still change, and breaking changes bump the minor version until
1.0. Supported so far: **Acaia Pearl S** and **Lunar**, run on real hardware
but not yet through the formal checks. More brands will come through the
contributor workflow.

## Docs

- [Design and API](https://github.com/mcgilly17/OpenPour/blob/main/docs/design.md)
- [Roadmap](https://github.com/mcgilly17/OpenPour/blob/main/docs/roadmap.md)
- [Decisions](https://github.com/mcgilly17/OpenPour/blob/main/docs/adr/README.md)
