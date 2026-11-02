# Web harness

A browser page for running OpenPour's drivers against real scales over Web
Bluetooth. Connect one or two scales, watch the decoded weight beside the raw
packets, send the driver's commands, compare packets, and export a fixture per
recording. It is dev-only and never published.

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
PROCH, PEARL, CINCO). The page asks for the driver's services and the
standard Device Information service (0x180A), nothing else, so other services
on the scale stay invisible to it. Connect a second scale the same way.

After connecting, the page reads the manufacturer, model number, firmware,
hardware and software revisions from Device Information and shows them under
"Bluetooth module". On the scales tested so far these describe the radio chip
(for example a Microchip BM70), not the scale, so they never fill the export
form: take the scale's model and firmware from its own app. The page never
reads the serial number (0x2A25): a serial identifies one scale, and fixtures
are public.

## Recording

The recording starts with the first connection, and every scale's fixture
counts time from that moment so two scales line up. Each fixture's header also
notes when its session started (`sessionStartT`, ADR 0018), so replay sends the
session's handshake and heartbeats at their recorded times. A fixture holds
every notification, every read the session asked for, and every write that
succeeded, timed when it was sent. A failed write is listed under the panel's
errors and notes, and left out of the fixture. Device Information reads are
never recorded.

Each connection gets its own recording, and the panel keeps every one in its
**Recordings** list until you **Discard** it, so a reconnect never loses one.
Fill in model, model year and firmware (leave `unknown` when you don't know)
and a scenario, then **Export** the recording you want; a live recording
exports everything so far. Reloading the page drops every recording, so export
before stopping `pnpm harness` or changing `src/`.

Fixtures are public, so they never contain the browser's device ID. The end of
a scale's advertised name can come from its hardware address, so the panel
shows only the brand and the matched prefix, such as "Acaia PEARL". Export
refuses a model, firmware or scenario with 6 or more hex digits in a row, which
looks like such an identifier.

## Log

Each panel's log shows every packet as it happens, tx or rx, one row per
notification or write, so you can see where the scale split a frame. The
events the driver decoded from a packet sit directly after it. Times are ms on
the fixture's time base, and the hex is exactly what the recording exports. A
write's row appears once the write succeeds, so it can follow packets that
arrived meanwhile; its time is when it was sent.

The log keeps its last 300 rows (`LOG_ROWS_SHOWN`); recordings keep
everything. **Pause display** freezes the rows on screen while recording
carries on, and the checkboxes hide tx, rx, readings or other events.

## Driver commands

The **Driver commands** buttons run the session's own tare, timer start, stop
and reset, and battery request. The page writes no other bytes. A command the
driver declares unsupported stays disabled, with the reason under the
buttons. **Timer** and **Battery** show the latest timer and battery events.

## Listen-only

**Connect listen-only** (or **Reconnect listen-only**) connects and checks the
GATT layout with the driver like a normal connection. It then subscribes to
the characteristics the driver's session would subscribe to and records what
arrives, sending nothing. **Start session** starts the driver's session, which
takes the subscription over instead of subscribing again, so no notification
is recorded twice.

The listening stretch is a recording of its own. Its fixture has no
`sessionStartT`, because no session ran during it. The session's recording
starts at **Start session**, so its fixture replays with the same writes: ADR
0018 allows no packet before a fixture's session start. A scale drops a
connection that sends no heartbeats within a few seconds, and the panel says
so while listening.

## Investigating a protocol

To find the bytes that carry a setting, change one setting at a time and
compare the frames:

1. Connect and wait for the frame you're after. For example, on an Acaia
   scale **Request battery** asks for the settings frame. Then **Pause
   display**.
2. Click **A** on the frame's first rx row. If the scale split it across
   notifications, shift-click **A** on its last row.
3. Disconnect. Change one setting in the vendor app and note what you
   changed. Close the app, then **Reconnect**: the earlier recording stays in
   the list.
4. Ask for the frame again, pause, and mark the new one as **A** the same way.
5. **Find** earlier packets starting with the first 3 bytes of A (more bytes
   match more narrowly), then **Compare as B** on the frame from before the
   change. When both frames are on screen, mark them with **A** and **B**
   directly.
6. The comparison lines both frames up byte by byte from index 0, whatever
   notifications they arrived in. It highlights the bytes that differ, lists
   their indices and values, and draws a bar where each notification began.
   Note the index and both values with the setting you changed, and export
   both recordings as the evidence.

The harness knows nothing about any brand's bytes. A byte's meaning comes from
your one change and from the driver's decoded events in the log. Matches start
only where a notification starts.

To see what a scale sends before any session reacts, such as a frame that
arrives right after subscribing, use **Connect listen-only**, wait a moment,
then **Start session** before the scale gives up.

## Troubleshooting

| The terminal or page says              | What to try                                                                                                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| waiting for a successful build of src/ | `src/` doesn't build, so there is no `dist/` to serve yet. Fix the error printed below the message; the page starts as soon as a build succeeds.                                  |
| tsdown couldn't start building src/    | The build couldn't start at all, for example on a broken `tsdown.config.ts` or missing packages. Read the error after the message, run `pnpm install`, then `pnpm harness` again. |
| isn't a secure context                 | Open it at `http://localhost:<port>`, not a network address.                                                                                                                      |
| This browser has no Web Bluetooth      | Use Chrome or Edge; on Linux see the flag above.                                                                                                                                  |
| No scale was chosen                    | The chooser was closed, or found nothing: check Bluetooth is on and allowed for the browser, and the scale is awake and not connected to a phone or another tab.                  |
| waiting for the scale to advertise…    | The scale isn't advertising yet, typically because it was switched on moments ago. The page retries every second for up to 15 s, then reports the failure; **Cancel** stops it.   |
| Couldn't connect                       | Wake the scale and bring it close. It accepts one connection at a time, so close vendor apps and other tabs. After a drop, wait about 15 s. The attempt gives up after 10 s.      |
| unknown-device                         | The scale connected but has none of the driver's services: a different scale, or a protocol variant the driver doesn't know yet.                                                  |
| … timed out after 3000 ms              | A Bluetooth operation stalled. The page moves on to the next command; if errors keep coming, disconnect and reconnect.                                                            |
| disconnected soon after listen-only    | Expected: nothing is sent, not even heartbeats. Press **Start session** sooner, or reconnect listen-only; the recording so far is kept.                                           |
| disconnected, without a click          | The scale dropped the connection, slept, or `src/` was rebuilt and the page reloaded.                                                                                             |
| looks like a device identifier         | An export answer has 6 or more hex digits in a row, such as a serial number, an address or a compact date. Reword it; write a date with dashes.                                   |
