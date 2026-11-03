import type { Driver } from "openpour";
import { acaia, INFO_WAIT_MS } from "openpour/acaia";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ACAIA_VECTORS as RX, ACAIA_COMMAND_VECTORS as TX } from "../../src/test/acaiaVectors.js";
import { ACAIA_GATT } from "../test/acaiaGatt.js";
import { advanceTo } from "../test/useFakeClock.js";
import { KNOWN_COMMANDS } from "./commandAvailability.js";
import { compareRuns } from "./comparePackets.js";
import type { LogEntry } from "./LogEntry.js";
import { selectRun } from "./selectRun.js";
import {
  click,
  connectTo,
  exportFixture,
  logged,
  notifyHex,
  shown,
  writtenHex,
} from "./test/connectScale.js";
import { stubGatt } from "./test/stubGatt.js";

vi.mock("./downloadText.js");

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

/** A Lunar settings frame (docs/design.md), and the same after switching its sound off. */
const SETTINGS_BEFORE = "efdd08094e020101000101010e50";
const SETTINGS_AFTER = "efdd08094e020101000001010d50";

function describeEntry(entry: LogEntry): string {
  if (entry.kind === "packet") return `${entry.record.t} ${entry.record.dir} ${entry.record.hex}`;
  if (entry.kind === "event") return `${entry.t} ${entry.event.type}`;
  return `${entry.t} ${entry.text}`;
}

describe("createScale log", () => {
  test("shows each packet with the events decoded from it directly after, on the fixture's time base", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    // The page's recording began 500 ms before this connection, as it does for a second scale.
    const { clock, panel, connected } = connectTo(gatt, {
      clockStartT: 1000,
      recordingStartT: 500,
    });
    await connected;
    // On the fixture's time base: the session identifies INFO_WAIT_MS after starting.
    const identified = 500 + INFO_WAIT_MS;
    const traffic: [number, string][] = [
      [identified + 200, RX.settings],
      [identified + 300, RX.weight],
      [identified + 400, RX.buttonStart],
      [identified + 500, RX.weight.slice(0, 16)],
      [identified + 510, RX.weight.slice(16)],
    ];
    for (const [t, hex] of traffic) {
      await advanceTo(clock, t + 500);
      notifyHex(gatt, hex, t + 500);
    }

    expect(logged(panel).map(describeEntry)).toEqual([
      "500 #1 session started",
      "500 state",
      `${identified} tx ${TX.identify}`,
      `${identified} tx ${TX.notificationRequest}`,
      `${identified + 200} rx ${RX.settings}`,
      `${identified + 200} state`,
      `${identified + 200} battery`,
      `${identified + 300} rx ${RX.weight}`,
      `${identified + 300} reading`,
      `${identified + 300} timer`,
      `${identified + 400} rx ${RX.buttonStart}`,
      `${identified + 400} button`,
      `${identified + 400} reading`,
      `${identified + 500} rx ${RX.weight.slice(0, 16)}`,
      `${identified + 510} rx ${RX.weight.slice(16)}`,
      // The timer still reads 0.2 s, so only the weight is new.
      `${identified + 510} reading`,
    ]);
  });

  test("shows exactly the packets, bytes and times its recording exports", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    const { clock, panel, connected } = connectTo(gatt);
    await connected;
    await advanceTo(clock, 300);
    notifyHex(gatt, RX.ackWithNegativeWeight, 300);
    click(panel, "tare");
    await advanceTo(clock, 2500);

    const packets = logged(panel).flatMap((e) => (e.kind === "packet" ? [e.record] : []));

    expect(exportFixture(panel, 1)?.records).toEqual(packets.toSorted((a, b) => a.t - b.t));
  });
});

describe("createScale driver commands", () => {
  test("each button sends its driver command; the timer and battery readouts follow the scale's events", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    const { clock, panel, connected } = connectTo(gatt);
    await connected;
    await advanceTo(clock, INFO_WAIT_MS);
    const before = writtenHex(gatt).length;

    for (const command of KNOWN_COMMANDS) click(panel, command);
    await vi.advanceTimersByTimeAsync(0);
    notifyHex(gatt, RX.settings, clock.now());
    notifyHex(gatt, RX.timer, clock.now());
    notifyHex(gatt, RX.timerStopNotice, clock.now());

    const sent = [TX.tare, TX.timerStart, TX.timerStop, TX.timerReset, TX.getSettings];
    expect(writtenHex(gatt).slice(before, before + sent.length)).toEqual(sent);
    expect(shown(panel, "battery")).toEqual(["93 %"]);
    expect(shown(panel, "timer")).toEqual(["running, 90.5 s", "stopped, 4.5 s"]);
  });

  test("a capability the driver declares false disables its buttons with the reason, and they send nothing", async () => {
    const noTimer: Driver = {
      ...acaia,
      createSession(gatt) {
        const session = acaia.createSession(gatt);
        return { ...session, capabilities: { ...session.capabilities, timer: false } };
      },
    };
    const gatt = stubGatt(ACAIA_GATT);
    const { clock, panel, connected } = connectTo(gatt, { driver: noTimer });
    await connected;
    await advanceTo(clock, INFO_WAIT_MS);
    const before = writtenHex(gatt).length;

    for (const command of ["timerStart", "timerStop", "timerReset"] as const) click(panel, command);
    await vi.advanceTimersByTimeAsync(0);

    const reason = "the driver declares no timer support";
    expect(panel.setCommands).toHaveBeenLastCalledWith({
      tare: undefined,
      timerStart: reason,
      timerStop: reason,
      timerReset: reason,
      battery: undefined,
    });
    expect(writtenHex(gatt)).toHaveLength(before);
  });
});

describe("createScale comparing frames across recordings", () => {
  test("finds a settings frame from before a reconnect and points at the bytes one setting changed", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    const { clock, panel, connected } = connectTo(gatt);
    await connected;
    await advanceTo(clock, 200);
    click(panel, "battery");
    // Split after the header, as the old Lunar does…
    notifyHex(gatt, SETTINGS_BEFORE.slice(0, 6), 210);
    notifyHex(gatt, SETTINGS_BEFORE.slice(6), 220);
    click(panel, "disconnect");
    await advanceTo(clock, 5000);
    click(panel, "reconnect");
    await advanceTo(clock, 5200);
    // …and mid-payload, as the Pearl S can.
    notifyHex(gatt, SETTINGS_AFTER.slice(0, 12), 5210);
    notifyHex(gatt, SETTINGS_AFTER.slice(12), 5220);

    const entries = logged(panel);
    const at = (t: number) => entries.findIndex((e) => e.kind === "packet" && e.record.t === t);
    const run = selectRun(entries.slice(at(5210), at(5220) + 1));
    if (!run) throw new Error("no run selected");
    const matches = panel.onFindEarlier.mock.calls[0]?.[0](run, 3) ?? [];

    expect(matches.map(({ recording, records }) => [recording, records.map(({ t }) => t)])).toEqual(
      [[1, [210, 220]]],
    );
    const cells = compareRuns(matches[0]?.records ?? [], run.records);
    expect(cells.filter((c) => c.isDifferent).map((c) => c.index)).toEqual([9, 12]);
    expect(entries.filter((e) => e.kind === "event" && e.event.type === "battery")).toHaveLength(2);
  });
});
