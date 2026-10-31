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

**In:** discover, connect, live weight, computed flow rate, tare, timer,
battery, capability flags, and one driver per brand.

**Out (belongs to consuming apps):** pour and phase detection, recipes, brew
sessions, storage and UI. Keeping the library small is what makes adoption easy.

## Layout

```
src/
  core/                 Scale, Reading, flow filter, scanner, Clock, OpenPourError
  drivers/acaia/        Pearl S, Lunar, Pyxis…
  transports/ble-plx/   React Native (react-native-ble-plx, optional peer dep)
  transports/replay/    plays fixtures back; platform-free
fixtures/<brand>/       scrubbed JSONL captures (ADR 0013)
spec/<brand>.md         protocol facts with sources (ADR 0015)
```

Published as one package with subpath exports: `openpour`, `openpour/acaia`,
`openpour/transports/ble-plx` and `openpour/transports/replay` (ADR 0007). `core/`, `drivers/` and
`transports/replay/` use no platform APIs, and the compiler enforces it (ADR 0009).

## API

```ts
// ── Setup and discovery ──────────────────────────────────
const op = new OpenPour({ transport, drivers: [acaia], clock })  // clock optional

for await (const ad of op.scan({ signal })) { … }   // native transports
const ad = await op.pick()                           // Web Bluetooth, from a user gesture
const scale = await op.connect(ad)

// ── Scale ────────────────────────────────────────────────
interface Scale {
  readonly info: ScaleInfo
  readonly capabilities: Capabilities
  readonly state: ScaleState
  readonly latest: Reading | undefined

  onReading(fn: (r: Reading) => void): Unsubscribe        // primary (ADR 0010)
  readings(opts?: { signal?: AbortSignal }): AsyncIterable<Reading>  // keeps the newest value only
  on<K extends keyof ScaleEvents>(name: K, fn: (e: ScaleEvents[K]) => void): Unsubscribe

  tare(): Promise<void>
  timer: { start(): Promise<void>; stop(): Promise<void>; reset(): Promise<void> }
  battery(): Promise<number>        // 0–100
  disconnect(): Promise<void>
}

type ScaleState = "connecting" | "connected" | "disconnected"
interface ScaleEvents { state: ScaleState; disconnect: { cause?: unknown }; button: ButtonEvent; timer: TimerEvent }
type Unsubscribe = () => void

interface Reading {
  t: number                // ms, from the injected Clock at receipt
  grams: number            // signed; negative after tare is real data
  stable: boolean          // the device's settled flag, or inferred
  flowGramsPerSec: number  // computed by OpenPour
}

interface ScaleInfo { brand: string; model: string; firmware?: string; id: string }
// id is opaque: a per-phone UUID on iOS, per-origin on Web Bluetooth. It is never a MAC.

interface Capabilities {
  tare: boolean; timer: boolean; battery: boolean
  resolutionGrams: number   // e.g. 0.1
  maxRateHz: number
}

// ── Time (ADR 0009) ─────────────────────────────────────
interface Clock {
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

// ── Errors (ADR 0012) ───────────────────────────────────
class OpenPourError extends Error {
  code: "unsupported" | "disconnected" | "timeout" | "not-found"
      | "unknown-device" | "permission" | "busy" | "protocol"
  cause?: unknown
}

// ── Driver: one per brand ───────────────────────────────
interface Driver {
  brand: string
  namePrefixes: string[]        // used to build scan and pick filters
  services: string[]            // also the Web Bluetooth optionalServices
  matches?(ad: Advertisement): boolean     // refines a match
  open(link: BleLink, ad: Advertisement, clock: Clock): Promise<Scale>
}

interface Advertisement { id: string; name?: string; rssi?: number; serviceUuids?: string[]; manufacturerData?: Uint8Array }

// ── Transport and BleLink: one per platform (ADR 0011) ──────
interface Transport {
  scan?(filter: ScanFilter, signal?: AbortSignal): AsyncIterable<Advertisement>
  pick?(filter: ScanFilter): Promise<Advertisement>
  connect(ad: Advertisement): Promise<BleLink>
}

interface BleLink {
  services(): Promise<{ uuid: string; characteristics: { uuid: string; properties: string[] }[] }[]>
  read(svc: string, chr: string): Promise<Uint8Array>
  notify(svc: string, chr: string, fn: (bytes: Uint8Array) => void): Promise<Unsubscribe>
  write(svc: string, chr: string, bytes: Uint8Array, mode: "response" | "noResponse"): Promise<void>
  requestMtu?(mtu: number): Promise<number>    // Android; iOS and web negotiate automatically
  onDisconnect(fn: () => void): Unsubscribe
  close(): Promise<void>
}
```

### Design rules

- **Flow is computed by OpenPour,** not read from the scale. The default is a 500 ms least-squares slope with a ±0.05 g deadband, both adjustable named constants. One calculation keeps curves comparable across brands.
- **Time comes from the injected Clock** on arrival. Most scales send no timestamps, and 20–50 ms of BLE latency is fine for coffee.
- **Missing features are reported, not faked.** If `capabilities.tare` is false, `tare()` throws `OpenPourError("unsupported")`. Capabilities can change after connecting, for example when a firmware check enables tare.
- **Every BLE operation has a timeout.** Drivers reassemble frames that arrive split or merged across notifications.
- **Disconnects are expected.** They emit `disconnect` and `state`, and the consuming app decides whether to reconnect.
- **Two scales at once is free:** two `Scale` instances run side by side, and the app pairs readings by `t`.
- **Supporting a native OpenPour scale needs only one more driver.** BleLink already covers every operation the protocol uses.

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
