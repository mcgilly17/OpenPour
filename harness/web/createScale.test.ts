import type { Driver } from "openpour";
import { acaia, NEW_STYLE_HEARTBEAT_MS, SUBSCRIBE_SETTLE_MS } from "openpour/acaia";
import { bytesToHex, type Fixture, hexToBytes, parseFixture } from "openpour/replay";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ACAIA_VECTORS as RX, ACAIA_COMMAND_VECTORS as TX } from "../../src/test/acaiaVectors.js";
import { ACAIA_GATT, ACAIA_NOTIFY, ACAIA_WRITE } from "../test/acaiaGatt.js";
import { advanceTo, useFakeClock } from "../test/useFakeClock.js";
import { createScale, RECORDING_REPLACED } from "./createScale.js";
import { EMPTY_FIELD, type PanelAction } from "./createScalePanel.js";
import { downloadText } from "./downloadText.js";
import { RECONNECT_RETRY_MS, RECONNECT_WINDOW_MS } from "./retryWhileOutOfRange.js";
import {
  asDevice,
  BATTERY_ONLY_GATT,
  DEVICE_INFORMATION_GATT,
  DIS,
  notify,
  operationsOn,
  readsAs,
  type StubGatt,
  stubGatt,
} from "./test/stubGatt.js";
import { type StubPanel, stubPanel } from "./test/stubPanel.js";

vi.mock("./downloadText.js");

const DISCOVERY = ["connect", "getPrimaryServices", "getCharacteristics"];
const HANDSHAKE = ["startNotifications", "writeValueWithoutResponse", "writeValueWithoutResponse"];

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

function connectTo(gatt: StubGatt, driver: Driver = acaia) {
  const clock = useFakeClock();
  const panel = stubPanel();
  const recordingStartT = vi.fn(() => 0);
  const device = asDevice(gatt.device);
  const scale = createScale({ device, label: "a", driver, clock, recordingStartT, panel });
  return { clock, panel, recordingStartT, connected: scale.connect() };
}

/** Clicks the panel's `action` button, through the handler the scale registered for it. */
function click(panel: StubPanel, action: PanelAction): void {
  const handler = panel.onAction.mock.calls.find(([name]) => name === action)?.[1];
  if (!handler) throw new Error(`no handler for ${action}`);
  handler();
}

/** Submits the export form with `answers`; returns the downloaded fixture, if there was one. */
function exportFixture(panel: StubPanel, answers = new FormData()): Fixture | undefined {
  panel.onExport.mock.calls[0]?.[0](answers);
  const jsonl = vi.mocked(downloadText).mock.calls.at(-1)?.[1];
  return jsonl === undefined ? undefined : parseFixture(jsonl);
}

function weightsShown(panel: StubPanel): string[] {
  return panel.show.mock.calls.flatMap(([field, text]) => (field === "weight" ? [text] : []));
}

function writtenHex({ characteristics }: StubGatt): string[] {
  return characteristics.flatMap((c) =>
    // The source writes Uint8Arrays.
    [...c.writeValueWithResponse.mock.calls, ...c.writeValueWithoutResponse.mock.calls].map(
      ([value]) => bytesToHex(value as Uint8Array),
    ),
  );
}

/** What a Pearl S lets the page see: the Acaia service and Device Information. */
function pearlS(): StubGatt {
  const gatt = stubGatt([...ACAIA_GATT, ...DEVICE_INFORMATION_GATT]);
  readsAs(gatt, DIS.modelNumber, "PEARLS");
  readsAs(gatt, DIS.serialNumber, "SERIAL-1234");
  readsAs(gatt, DIS.firmwareRevision, "1.0.016");
  return gatt;
}

const TWO_SERVICE_DISCOVERY = [...DISCOVERY, "getCharacteristics"];
const DEVICE_INFO_READS = Array<string>(5).fill("readValue");

describe("createScale", () => {
  test("an unknown device is disconnected and reported, and no runner or recording starts", async () => {
    const gatt = stubGatt([...BATTERY_ONLY_GATT, ...DEVICE_INFORMATION_GATT], "PEARL x");
    const { clock, panel, recordingStartT, connected } = connectTo(gatt);

    await connected;
    await advanceTo(clock, 10_000);

    expect(operationsOn(gatt)).toEqual([...TWO_SERVICE_DISCOVERY, "disconnect"]);
    expect(panel.setConnection.mock.calls).toEqual([["connecting"], ["failed"]]);
    expect(panel.addError).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("(unknown-device)"),
    );
    expect(recordingStartT).not.toHaveBeenCalled();
    expect(panel.show).not.toHaveBeenCalledWith("protocol", "handshaking");
    expect(weightsShown(panel).at(-1)).toBe(EMPTY_FIELD);
  });

  test("a drop clears the weight, so the last reading never reads as live", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    const { clock, panel, connected } = connectTo(gatt);
    await connected;
    await advanceTo(clock, SUBSCRIBE_SETTLE_MS);
    const notifier = gatt.characteristics.find(({ uuid }) => uuid === ACAIA_NOTIFY);
    if (!notifier) throw new Error("no notify characteristic");
    notify(notifier, new DataView(hexToBytes(RX.weight).buffer), clock.now());
    expect(weightsShown(panel).at(-1)).toContain("175.9 g");

    gatt.device.dispatchEvent(new Event("gattserverdisconnected"));

    expect(panel.setConnection).toHaveBeenLastCalledWith("disconnected");
    expect(weightsShown(panel).at(-1)).toBe(EMPTY_FIELD);
  });

  test("a matching scale is only discovered and read until its session asks to subscribe; writes follow", async () => {
    const gatt = pearlS();
    const { clock, panel, connected } = connectTo(gatt);

    await connected;
    await advanceTo(clock, SUBSCRIBE_SETTLE_MS - 1);
    const opened = [...TWO_SERVICE_DISCOVERY, ...DEVICE_INFO_READS];
    expect(operationsOn(gatt)).toEqual([...opened, "startNotifications"]);
    await advanceTo(clock, SUBSCRIBE_SETTLE_MS);

    expect(operationsOn(gatt)).toEqual([...opened, ...HANDSHAKE]);
    expect(panel.setConnection.mock.calls).toEqual([["connecting"], ["connected"]]);
    expect(panel.show).toHaveBeenCalledWith("protocol", "handshaking");
  });

  test("Device Information is shown, never fills the export form and never becomes a packet", async () => {
    const { clock, panel, connected } = connectTo(pearlS());
    await connected;
    await advanceTo(clock, SUBSCRIBE_SETTLE_MS);

    const fixture = exportFixture(panel);

    expect(fixture?.header).toMatchObject({ model: "unknown", firmware: "unknown" });
    expect(new Set(fixture?.records.map(({ chr }) => chr))).toEqual(new Set([ACAIA_WRITE]));
    expect(JSON.stringify(panel.show.mock.calls)).not.toContain("SERIAL");
  });

  test("an exported fixture records when the session started, before its first write", async () => {
    const { clock, panel, connected } = connectTo(stubGatt(ACAIA_GATT));
    await connected;
    await advanceTo(clock, SUBSCRIBE_SETTLE_MS);

    const fixture = exportFixture(panel);

    expect(fixture?.header.sessionStartT).toBe(0);
    expect(fixture?.records[0]?.t).toBe(SUBSCRIBE_SETTLE_MS);
  });
});

describe("createScale and device identifiers", () => {
  test("the title shows the brand and matched name prefix, never the rest of the name", async () => {
    const { panel, connected } = connectTo(stubGatt(ACAIA_GATT, "PEARLSD9F8BC"));
    await connected;

    expect(panel.show).toHaveBeenCalledWith("title", "Scale a: Acaia PEARL");
    expect(JSON.stringify(panel.show.mock.calls)).not.toContain("D9F8BC");
  });

  test.each(["model", "firmware", "scenario"])(
    "refuses to export a %s that looks like a device identifier",
    async (name) => {
      const { clock, panel, connected } = connectTo(stubGatt(ACAIA_GATT));
      await connected;
      await advanceTo(clock, SUBSCRIBE_SETTLE_MS);
      const answers = new FormData();
      answers.set(name, "PEARLSD9F8BC");

      expect(exportFixture(panel, answers)).toBeUndefined();
      expect(panel.addError).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining(`${name} "PEARLSD9F8BC" contains D9F8BC`),
      );
    },
  );
});

describe("createScale controls", () => {
  test("Tare sends one tare write", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    const { clock, panel, connected } = connectTo(gatt);
    await connected;
    await advanceTo(clock, SUBSCRIBE_SETTLE_MS);

    click(panel, "tare");
    await vi.advanceTimersByTimeAsync(0);

    expect(writtenHex(gatt).filter((hex) => hex === TX.tare)).toHaveLength(1);
  });

  test("Disconnect closes the connection; then nothing is written and no wake-up is left", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    const { clock, panel, connected } = connectTo(gatt);
    await connected;
    await advanceTo(clock, SUBSCRIBE_SETTLE_MS);
    const writes = writtenHex(gatt).length;

    click(panel, "disconnect");
    await advanceTo(clock, 10 * NEW_STYLE_HEARTBEAT_MS);

    expect(gatt.server.disconnect).toHaveBeenCalledOnce();
    expect(writtenHex(gatt)).toHaveLength(writes);
    expect(vi.getTimerCount()).toBe(0);
    expect(panel.setConnection).toHaveBeenLastCalledWith("disconnected");
  });

  test("Reconnect starts one fresh session, runner and recording, timed from the shared start", async () => {
    const reconnectT = 5000;
    const gatt = stubGatt(ACAIA_GATT);
    const driver = { ...acaia, createSession: vi.fn(acaia.createSession) };
    const { clock, panel, recordingStartT, connected } = connectTo(gatt, driver);
    await connected;
    await advanceTo(clock, SUBSCRIBE_SETTLE_MS);
    click(panel, "disconnect");
    await advanceTo(clock, reconnectT);
    const before = operationsOn(gatt).length;

    click(panel, "reconnect");
    await advanceTo(clock, reconnectT + SUBSCRIBE_SETTLE_MS);

    expect(operationsOn(gatt).slice(before)).toEqual([...DISCOVERY, ...HANDSHAKE]);
    expect(driver.createSession).toHaveBeenCalledTimes(2);
    expect(recordingStartT).toHaveBeenCalledTimes(2);
    const fixture = exportFixture(panel);
    expect(fixture?.header.sessionStartT).toBe(reconnectT);
    expect(fixture?.records.map(({ t, hex }) => [t, hex])).toEqual([
      [reconnectT + SUBSCRIBE_SETTLE_MS, TX.identify],
      [reconnectT + SUBSCRIBE_SETTLE_MS, TX.notificationRequest],
    ]);
  });

  test("Reconnect says when it replaces a recording that has packets, and only then", async () => {
    const { clock, panel, connected } = connectTo(stubGatt(ACAIA_GATT));
    await connected;
    // Disconnected before the handshake's first write: nothing recorded, nothing to lose.
    click(panel, "disconnect");
    click(panel, "reconnect");
    await advanceTo(clock, SUBSCRIBE_SETTLE_MS);
    expect(panel.addNote).not.toHaveBeenCalled();

    click(panel, "disconnect");
    click(panel, "reconnect");
    await vi.advanceTimersByTimeAsync(0);

    expect(panel.addNote).toHaveBeenCalledExactlyOnceWith(RECORDING_REPLACED);
  });
});

describe("createScale waiting for a scale to advertise", () => {
  const outOfRange = () =>
    new DOMException("Bluetooth Device is no longer in range.", "NetworkError");

  test("keeps trying while the scale isn't advertising, then connects", async () => {
    const failures = 3;
    const gatt = stubGatt(ACAIA_GATT);
    for (let i = 0; i < failures; i++) gatt.server.connect.mockRejectedValueOnce(outOfRange());
    const { clock, panel, connected } = connectTo(gatt);

    await advanceTo(clock, failures * RECONNECT_RETRY_MS);
    await connected;

    expect(gatt.server.connect).toHaveBeenCalledTimes(failures + 1);
    const waiting = Array.from({ length: failures }, () => ["waiting"]);
    expect(panel.setConnection.mock.calls).toEqual([["connecting"], ...waiting, ["connected"]]);
    expect(panel.addError).not.toHaveBeenCalled();
  });

  test("reports the failure only once the whole window has passed", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    gatt.server.connect.mockImplementation(() => Promise.reject(outOfRange()));
    const { clock, panel, connected } = connectTo(gatt);

    await advanceTo(clock, RECONNECT_WINDOW_MS - 1);
    expect(panel.setConnection).toHaveBeenLastCalledWith("waiting");
    await advanceTo(clock, RECONNECT_WINDOW_MS);
    await connected;

    const attempts = RECONNECT_WINDOW_MS / RECONNECT_RETRY_MS + 1;
    expect(gatt.server.connect).toHaveBeenCalledTimes(attempts);
    expect(panel.setConnection).toHaveBeenLastCalledWith("failed");
    expect(panel.addError).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("no longer in range"),
    );
  });

  test("Cancel stops waiting: no more attempts, and no error", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    gatt.server.connect.mockImplementation(() => Promise.reject(outOfRange()));
    const { clock, panel, connected } = connectTo(gatt);
    await advanceTo(clock, RECONNECT_RETRY_MS / 2);

    click(panel, "cancel");
    await connected;
    await advanceTo(clock, 2 * RECONNECT_WINDOW_MS);

    expect(gatt.server.connect).toHaveBeenCalledOnce();
    expect(panel.setConnection).toHaveBeenLastCalledWith("disconnected");
    expect(panel.addError).not.toHaveBeenCalled();
  });

  test("Cancel during an attempt that then succeeds closes that connection unused", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    gatt.server.connect
      .mockRejectedValueOnce(outOfRange())
      .mockImplementationOnce(() => new Promise((resolve) => setTimeout(resolve, 500)));
    const { clock, panel, connected } = connectTo(gatt);
    await advanceTo(clock, RECONNECT_RETRY_MS + 100);

    click(panel, "cancel");
    await advanceTo(clock, RECONNECT_RETRY_MS + 500);
    await connected;

    expect(operationsOn(gatt)).toEqual(["connect", "disconnect", ...DISCOVERY, "disconnect"]);
    expect(panel.setConnection).toHaveBeenLastCalledWith("disconnected");
  });
});
