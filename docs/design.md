# OpenPour: open coffee scale library and protocol

OpenPour is an MIT-licensed driver library that gives every Bluetooth coffee
scale the same API. A published protocol spec will follow once the library
has users. Decisions are recorded in [`docs/adr/`](adr/README.md) and code
style in [`docs/conventions.md`](conventions.md).

## Why

- **No open standard exists.** The Bluetooth Weight Scale profile (0x181D) is for body weight: 5 g resolution, no flow, no tare or timer.
- **Every brand speaks its own protocol,** and a firmware update can break it.
- **Existing multi-brand code can't be reused.** It is built into individual apps.

## Scope

**In:** scan filters, decoding live weight, computed flow rate, tare, timer,
battery, capability flags, and one driver per brand.

**Out (belongs to consuming apps):** all Bluetooth I/O, pour and phase
detection, recipes, brew sessions, storage and UI. Keeping the library small is what makes adoption easy.

## Layout

```
src/
  core/                 session types, Reading, flow filter, OpenPourError
  drivers/acaia/        Pearl S, Lunar, Pyxis…
  replay/               feeds fixtures into a session; used by tests
fixtures/<brand>/       scrubbed JSONL captures (ADR 0013)
spec/<brand>.md         protocol facts, each tied to a fixture (ADR 0015)
```

Published as one package with subpath exports: `openpour`, `openpour/acaia` and
`openpour/replay` (ADR 0007). All of `src/` is platform-free, and the compiler
enforces it (ADR 0009).

## How it works (ADR 0017)

OpenPour never touches Bluetooth. It is a translator: the app hands it bytes
and the time they arrived, and it hands back events plus a to-do list.

```
app (owns Bluetooth)                         OpenPour (pure, synchronous)
  scan, connect, discover GATT  ──gatt──────>  driver.createSession(gatt)
  notification arrives          ──chr,bytes,t> session.receive(...)
  timer fires at wakeAt         ──t─────────>  session.tick(t)
  user taps Tare                ──t─────────>  session.tare(t)
                                <──Step──────  { events, commands, wakeAt? }
  run commands, publish events, schedule next tick
```

## API

```ts
// ── Driver: one per brand ───────────────────────────────
interface Driver {
  brand: string;
  namePrefixes: string[]; // for the app's scan filter
  services: string[]; // for the scan filter and Web Bluetooth optionalServices
  matches?(ad: Advertisement): boolean; // refines a name match
  createSession(gatt: GattLayout): ScaleSession; // gatt picks the protocol variant
}

interface Advertisement {
  name?: string;
  serviceUuids?: string[];
  manufacturerData?: Uint8Array;
}
type GattLayout = { uuid: string; characteristics: { uuid: string; properties: string[] }[] }[];

// ── Session: a synchronous state machine per connected scale ──
interface ScaleSession {
  readonly info: ScaleInfo;
  readonly capabilities: Capabilities;
  start(t: number): Step; // after connecting
  receive(chr: string, bytes: Uint8Array, t: number): Step; // every notification or read result
  tick(t: number): Step; // at or after the last wakeAt
  tare(t: number): Step;
  timer: { start(t: number): Step; stop(t: number): Step; reset(t: number): Step };
  requestBattery(t: number): Step;
}

interface Step {
  events: ScaleEvent[];
  commands: Command[];
  wakeAt?: number; // call tick() at this time (heartbeats, handshake delays, timeouts)
}

type Command =
  | { type: "subscribe"; svc: string; chr: string }
  | { type: "write"; svc: string; chr: string; bytes: Uint8Array; mode: "response" | "noResponse" }
  | { type: "read"; svc: string; chr: string };

type ScaleEvent =
  | { type: "reading"; reading: Reading }
  | { type: "battery"; percent: number }
  | { type: "button"; button: string }
  | { type: "timer"; running: boolean; ms: number }
  | { type: "state"; state: "handshaking" | "ready" }
  | { type: "error"; error: OpenPourError };

interface Reading {
  t: number; // ms, the arrival time the app passed in
  grams: number; // signed; negative after tare is real data
  stable: boolean; // the device's settled flag, or inferred
  flowGramsPerSec: number; // computed by OpenPour
}

interface ScaleInfo {
  brand: string;
  model: string;
  firmware?: string;
}

interface Capabilities {
  tare: boolean;
  timer: boolean;
  battery: boolean;
  resolutionGrams: number; // e.g. 0.1
  maxRateHz: number;
}

// ── Errors (ADR 0012) ───────────────────────────────────
class OpenPourError extends Error {
  code: "unsupported" | "timeout" | "unknown-device" | "protocol";
  cause?: unknown;
}
```

`tare()` and the timer methods throw `OpenPourError("unsupported")` when the
capability is false. Everything else is reported as an `error` event.

### App glue (any BLE library)

```ts
const session = driver.createSession(await device.discoverGatt());
let timer: Handle | undefined;

function apply(step: Step) {
  for (const c of step.commands) {
    if (c.type === "subscribe")
      device.onNotify(c.svc, c.chr, (bytes, t) => apply(session.receive(c.chr, bytes, t)));
    if (c.type === "write") device.write(c.svc, c.chr, c.bytes, c.mode);
    if (c.type === "read")
      device.read(c.svc, c.chr).then((bytes) => apply(session.receive(c.chr, bytes, now())));
  }
  for (const e of step.events) publish(e); // chart, recorder, UI
  clearTimeout(timer);
  if (step.wakeAt !== undefined)
    timer = setTimeout(() => apply(session.tick(now())), step.wakeAt - now());
}

apply(session.start(now()));
```

`t` should be the arrival time, stamped as close to the radio as the BLE
library allows. The app also owns permissions, reconnects and BLE timeouts.

### Design rules

- **Flow is computed by OpenPour,** not read from the scale. The default is a 500 ms least-squares slope with a ±0.05 g deadband, both adjustable named constants. One calculation keeps curves comparable across brands.
- **Time is always passed in.** OpenPour has no clock or timers; `wakeAt` asks the app to call back. Most scales send no timestamps, so the app's arrival time is the reading's time.
- **Missing features are reported, not faked.** Capabilities can change after the handshake, for example when a firmware check enables tare.
- **Drivers reassemble frames** that arrive split or merged across notifications.
- **Protocol timeouts are events.** A missed heartbeat reply surfaces from `tick` as an `error` event with code `timeout`; the app decides whether to reconnect.
- **Two scales at once is free:** two sessions run side by side, and the app pairs readings by `t`.
- **A native OpenPour scale is just another driver,** whose commands use the published service below.

## Acaia notes (all to verify on hardware)

Facts gathered from public information and our own captures (ADR 0015).
Verified facts move into `spec/acaia.md`, each tied to the fixture that proves it.

- **New style** (Pyxis, Lunar 2021+, Pearl S expected):
  - service `49535343-FE7D-4AE5-8FA9-9FAFD205E455`
  - write `49535343-8841-43F4-A8D4-ECBE34729BB3`
  - notify `49535343-1E4D-4BD9-BA61-23C647249616`
- **Old style** (older Lunar): service `0x1820`, with one characteristic `0x2A80` for both directions.
- **Telling them apart:** the variant is decided by GATT discovery after connecting, not by the advertisement. Name prefixes: `ACAIA`, `LUNAR`, `PYXIS`, `PROCH`, `PEARL`, `CINCO`.
- **Frame layout:** `EF DD`, then type, length, payload and a 2-byte checksum. The checksum is the sum of the even-index payload bytes and the sum of the odd-index bytes, each `& 0xFF`.
- **Messages sent to the scale:**

  | Type | Message              | Payload                                    |
  | ---- | -------------------- | ------------------------------------------ |
  | 0    | heartbeat            | `02 00`                                    |
  | 4    | tare                 |                                            |
  | 6    | get settings         |                                            |
  | 11   | identify             | 15 bytes                                   |
  | 12   | notification request |                                            |
  | 13   | timer                | start `00 00`, reset `00 01`, stop `00 02` |

- **Messages from the scale:**
  - type 8, settings (battery is `b1 & 0x7F`);
  - type 12, events: 5 weight, 7 timer, 8 button, 11 heartbeat reply.
- **Weight:** a 16-bit little-endian value, a unit byte (divide by 10^n), and sign bit `0x02`.
- **Handshake:** subscribe, wait about 100 ms, identify, wait about 100 ms, then the notification request.
- **Heartbeat:** about every 1 s on new style and about every 5 s on old style. Keep it as a named constant per variant.
- **Connections:** after a drop, wait about 15 s before reconnecting. The scale accepts only one connection at a time.
- **Lunar 2021:** tare and timer need current firmware. Only 2021+ models report the timer state.
- **Lunar model year:** check whether a given Lunar is a 2021 or 2025 model; the protocols may differ.

## Protocol spec (later, once there are users)

This is a Bluetooth service that scale makers can build into their firmware.
Their scales then work through a single OpenPour-native driver.

| Characteristic | Props       | Payload                                                                                       |
| -------------- | ----------- | --------------------------------------------------------------------------------------------- |
| Weight         | notify      | `int32` weight in 0.01 g, `uint16` device ms counter, `uint8` flags (stable, tared, overload) |
| Control        | write       | `uint8` op: tare, timer start/stop/reset, + args                                              |
| Info           | read        | brand, model, firmware, resolution, max rate                                                  |
| Battery        | read/notify | standard `0x180F`                                                                             |

Little-endian and versioned, with no encryption or required cloud. A reference
ESP32 + HX711 firmware will ship alongside it. Licence: MIT for the library,
CC-BY for the spec.
