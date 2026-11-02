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
harness/                dev-only live harness, never published
  runner/               Bluetooth source port, session runner, listening source, recorder, fake source
  web/                  Web Bluetooth source and the React page; shadcn/ui components in components/ui/
scripts/                dev-only Node scripts: the harness launcher, packaging check
```

The harness uses OpenPour only through its package exports, as any consumer
would, so `pnpm validate` builds `dist/` before typechecking and testing it.
`pnpm harness` builds and watches those exports and serves the page; see
[`harness/README.md`](../harness/README.md) for prerequisites and troubleshooting.

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

### Replay

`openpour/replay` is the same glue running on recorded time:
`replay(session, parseFixture(text))` starts the session at the header's
`sessionStartT`, or at the first record when the header has none (ADR 0018).
It then feeds each `rx` line to `receive` at its `t`, and ticks at every due
`wakeAt` up to the last record. Every event and command comes back with its
time, so a recording made with `sessionStartT` replays with the same writes, at
the same times, as its `tx` lines.

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
- **Frame layout:** `EF DD`, then type, payload and a 2-byte checksum. The checksum is the sum of the even-index payload bytes and the sum of the odd-index bytes, each `& 0xFF`. In frames from the scale, the first payload byte is a length that counts itself and the rest of the payload.
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
- **Weight:** a little-endian value in bytes 0–2 (byte 3 not yet known), a decimals byte (divide by 10^n, n = 1–4), and sign bit `0x02` in byte 5. Events chain records: tag 5 weight (6 bytes), 6 battery (1), 7 timer (3: minutes, seconds, tenths), 8 button (1: `00` tare, `08` start, `09` reset, `0A` stop), 11 heartbeat reply (2).
- **Identify:** the scale appears to ignore the 15 bytes. ASCII `012345678901234` is the most widely used choice for both styles.
- **Handshake:** subscribe, identify, then the notification request. No delays are strictly needed, but a short wait (about 100 ms) after subscribing is common. An inbound type 7 frame means "not identified yet": send identify again. No settings request is needed.
- **MTU:** request 247 after connecting; the Pyxis is reported to need it. This is the app's job.
- **Heartbeat:** every 1–2 s on new style; old style is reported at up to 5 s. Re-send the notification request with each heartbeat, since scales may drop it. Keep the interval as a named constant per variant.
- **Write mode:** old style writes without response.
- **Heartbeat reply:** type 12 tag 11 carries 2 unknown bytes and is often followed by a weight or timer record in the same frame.
- **Open questions, captures only:** which bit marks a settled weight (bit `0x01` of byte 5 is unused by every known decoder), and whether weights arrive in ounces when the scale is set to ounces (settings byte 2: `02` grams, `05` ounces).
- **Connections:** after a drop, wait about 15 s before reconnecting. The scale accepts only one connection at a time.
- **Lunar 2021:** tare and timer need current firmware. Only 2021+ models report the timer state.
- **Lunar model year:** check whether a given Lunar is a 2021 or 2025 model; the protocols may differ.

### Observed on hardware (smoke tests, not yet fixture-backed)

First live-harness sessions on a Pearl S (2022, firmware 1.0.008) and a
Lunar (2021 per its owner, firmware 1.0.019 A). These are observations, not verified facts: each moves to
`spec/acaia.md` only with a committed fixture (1.1, 1.5b).

- **The "new style" service is a module default:** `49535343-…` is the
  Microchip (ISSC) transparent-UART service of the BM70 radio module; Acaia's
  protocol runs over it. The Pearl S also exposes `49535343-c9d0-cc83-a44a-6fe238d06d33`,
  likely the module's own configuration or update channel, which OpenPour must
  never write to. GATT layout therefore identifies the chip, not the brand: for
  new-style Acaia, the name filter does more of the device matching than the
  GATT fingerprint.
- **Device Information (0x180A) describes the module,** not the scale: the
  Pearl S reports `MCHP`, `BM70`, firmware `009010`. The scale's own model and
  firmware are not known to be readable yet.
- **The 2021 Lunar tested is old style** (`1820`/`2a80`), contradicting the
  "Lunar 2021+ is new style" note above; it decoded on the first attempt.
  Whether "2021" is the model generation or the purchase year is unconfirmed. It splits every frame after `EF DD 0C`; the Pearl S splits at
  arbitrary points.
- **The type 7 frame carries a version-like triplet, probably the firmware.**
  It can arrive immediately after subscribing (on some Pearl S connections, not
  others): length `07`, payload `03 5C 01 00 08 01`. Payload bytes 2–4 read
  1.0.8, matching the scale's firmware 1.0.008 on two captures (an attempted
  update to 1.0.009 had not applied). Not yet seen to change with a firmware
  change. Bytes 0–1 differ between models and are unknown. The session
  currently treats the frame only as "send identify again".
- **Battery** arrives unrequested about every 20 s on the Pearl S. On the Lunar
  a settings frame byte of `0x4E` decoded as 78%, and the vendor app showed 78%
  at the same time (bit 7 clear; read as "timer not running" by other sources).
- **Lunar settings frame** (`EF DD 08`, length `09`, then 8 setting bytes):
  `4E 02 01 01 00 01 01 01` with max weight 2000 g and touch on. Against the
  vendor app: auto-off `01` matched "5 minutes" and sound `01` matched "on".
  Changing one setting at a time:
  - max weight 2000 g → 1000 g flipped only the last byte, `01` → `00`;
  - sound on → off flipped only the sixth byte, `01` → `00` (predicted
    beforehand);
  - the fifth byte is `00` while touch is enabled. Turning touch off locks it
    for about two minutes, and the byte counts down through the lock: three
    captures 38.8 s apart read 111, 92 and 67, a steady 1.13 per second (about
    0.88 s per step, not seconds), and it reads `00` again once touch returns.

  Auto connect and bytes 2, 3 and 7 (`01` each: mode, auto-off and the byte
  other sources call resolution) are not otherwise tested.
- **Units follow the display, so ounces arrive as ounces.** The same object
  settled at `116.4` (units byte `02`, 1 decimal) in grams and `4.106` (units
  byte `05`, 3 decimals) in ounces on the Lunar; 4.106 oz is 116.40 g. A driver
  that ignores the units byte reports ounces as grams. Whether a units change
  made on the scale mid-session sends a new settings frame is untested.
- **Weight byte 5, bit 0 marks an unsettled reading** on the Lunar: set on every
  reading while the load was changing, clear on every reading at rest and once
  settled.
- **Timer record on the old Lunar:** every weight frame carries `07 00 00 02`,
  which decodes as "stopped at 0.2 s" and never changes while the timer is
  idle. Unverified until the timer is run (check C9).
- **Connections:** a scale drops a connection that sends no heartbeat within a
  few seconds, and needs a few seconds after power-on before it accepts one.

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
