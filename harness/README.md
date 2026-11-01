# Web harness

A browser page for running OpenPour's drivers against real scales over Web
Bluetooth. Connect one or two scales, watch the decoded weight, tare, and
export a fixture per scale. It is dev-only and never published.

## Prerequisites

- **Browser:** Chrome or Edge on macOS, Windows, Linux or Android. Safari and
  Firefox have no Web Bluetooth. On Linux, Chrome needs BlueZ; if the page
  says the browser has no Web Bluetooth, enable
  `chrome://flags/#enable-experimental-web-platform-features`.
- **OS permission:** the browser must be allowed to use Bluetooth. On macOS
  that is System Settings › Privacy & Security › Bluetooth. On Android, allow
  Chrome to find nearby devices.
- **Tools:** Node 24 and pnpm (`corepack enable` provides the pinned
  version). Nix is optional.

## Run it

```sh
pnpm install
pnpm harness
```

`pnpm harness` builds OpenPour's package exports into `dist/`, keeps
rebuilding them as `src/` changes, and serves the page at
<http://localhost:5173> (the next free port if that one is taken). Open it in
Chrome or Edge. A rebuild reloads the page, which drops any connected scales.
Stop with Ctrl-C.

## Secure context

Browsers only offer Web Bluetooth to secure contexts: `localhost` counts, a
network address such as `http://192.168.1.20:5173` does not. To use a phone,
forward the port so the phone opens `localhost`: `adb reverse tcp:5173 tcp:5173`,
or Port forwarding in `chrome://inspect`.

## The device chooser and service permissions

**Connect a scale** opens the browser's chooser, which lists only devices
whose names match the driver's prefixes (for Acaia: ACAIA, LUNAR, PYXIS,
PROCH, PEARL, CINCO). The page asks for the driver's services and nothing
else, so other services on the scale stay invisible to it. Connect a second
scale the same way.

## Recording

The recording starts with the first connection, and every scale's fixture
counts time from that moment so two scales line up. Each fixture's header also
notes when its session started (`sessionStartT`, ADR 0018), so replay sends the
session's handshake and heartbeats at their recorded times. Each connection
records its own traffic: **Reconnect** starts a fresh session and a new
recording, so export first. To export, fill in model, model year and firmware
(leave `unknown` when you don't know) and a scenario, then **Export fixture**.
Fixtures never contain the browser's device ID.

## Troubleshooting

| The page says                     | What to try                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| isn't a secure context            | Open it at `http://localhost:<port>`, not a network address.                                                                                                                 |
| This browser has no Web Bluetooth | Use Chrome or Edge; on Linux see the flag above.                                                                                                                             |
| No scale was chosen               | The chooser was closed, or found nothing: check Bluetooth is on and allowed for the browser, and the scale is awake and not connected to a phone or another tab.             |
| Couldn't connect                  | Wake the scale and bring it close. It accepts one connection at a time, so close vendor apps and other tabs. After a drop, wait about 15 s. The attempt gives up after 10 s. |
| unknown-device                    | The scale connected but has none of the driver's services: a different scale, or a protocol variant the driver doesn't know yet.                                             |
| … timed out after 3000 ms         | A Bluetooth operation stalled. The page moves on to the next command; if errors keep coming, disconnect and reconnect.                                                       |
| disconnected, without a click     | The scale dropped the connection, slept, or `src/` was rebuilt and the page reloaded.                                                                                        |
