import { acaia, NEW_STYLE_HEARTBEAT_MS, SUBSCRIBE_SETTLE_MS } from "openpour/acaia";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ACAIA_VECTORS as RX, ACAIA_COMMAND_VECTORS as TX } from "../../src/test/acaiaVectors.js";
import { ACAIA_GATT, ACAIA_WRITE } from "../test/acaiaGatt.js";
import { advanceTo } from "../test/useFakeClock.js";
import { EMPTY_FIELD } from "./createScalePanel.js";
import { RECONNECT_RETRY_MS, RECONNECT_WINDOW_MS } from "./retryWhileOutOfRange.js";
import {
  click,
  connectTo,
  DEVICE_INFO_READS,
  DISCOVERY,
  exportFixture,
  HANDSHAKE,
  notifyHex,
  pearlS,
  recordingsShown,
  shown,
  TWO_SERVICE_DISCOVERY,
  writtenHex,
} from "./test/connectScale.js";
import {
  BATTERY_ONLY_GATT,
  DEVICE_INFORMATION_GATT,
  operationsOn,
  stubGatt,
} from "./test/stubGatt.js";
import type { StubPanel } from "./test/stubPanel.js";

vi.mock("./downloadText.js");

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const weightsShown = (panel: StubPanel): string[] => shown(panel, "weight");

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
    notifyHex(gatt, RX.weight, clock.now());
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

    const fixture = exportFixture(panel, 1);

    expect(fixture?.header).toMatchObject({ model: "unknown", firmware: "unknown" });
    expect(new Set(fixture?.records.map(({ chr }) => chr))).toEqual(new Set([ACAIA_WRITE]));
    expect(JSON.stringify(panel.show.mock.calls)).not.toContain("SERIAL");
  });

  test("an exported fixture records when the session started, before its first write", async () => {
    const { clock, panel, connected } = connectTo(stubGatt(ACAIA_GATT));
    await connected;
    await advanceTo(clock, SUBSCRIBE_SETTLE_MS);

    const fixture = exportFixture(panel, 1);

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

      expect(exportFixture(panel, 1, answers)).toBeUndefined();
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
    const { clock, panel, recordingStartT, connected } = connectTo(gatt, { driver });
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
    const fixture = exportFixture(panel, 2);
    expect(fixture?.header.sessionStartT).toBe(reconnectT);
    expect(fixture?.records.map(({ t, hex }) => [t, hex])).toEqual([
      [reconnectT + SUBSCRIBE_SETTLE_MS, TX.identify],
      [reconnectT + SUBSCRIBE_SETTLE_MS, TX.notificationRequest],
    ]);
  });

  test("Reconnect keeps the earlier recording, which still exports on its own", async () => {
    const reconnectT = 5000;
    const gatt = stubGatt(ACAIA_GATT);
    const { clock, panel, connected } = connectTo(gatt);
    await connected;
    await advanceTo(clock, 300);
    notifyHex(gatt, RX.settings, 300);
    click(panel, "disconnect");
    await advanceTo(clock, reconnectT);
    click(panel, "reconnect");
    await advanceTo(clock, reconnectT + 300);
    notifyHex(gatt, RX.weight, reconnectT + 300);

    expect(recordingsShown(panel)).toEqual([
      { id: 1, text: "#1 session, ended, 3 packets", canDiscard: true },
      { id: 2, text: "#2 session, live", canDiscard: false },
    ]);
    const answers = new FormData();
    answers.set("scenario", "settings-change");
    answers.set("scenarioDetail", "sound-off");
    const first = exportFixture(panel, 1, answers);
    expect(first?.header).toMatchObject({
      scenario: "settings-change-sound-off-a",
      sessionStartT: 0,
    });
    expect(first?.records.map(({ t, hex }) => [t, hex])).toEqual([
      [SUBSCRIBE_SETTLE_MS, TX.identify],
      [SUBSCRIBE_SETTLE_MS, TX.notificationRequest],
      [300, RX.settings],
    ]);
    const second = exportFixture(panel, 2);
    expect(second?.header.sessionStartT).toBe(reconnectT);
    expect(second?.records.map(({ hex }) => hex)).toEqual([
      TX.identify,
      TX.notificationRequest,
      RX.weight,
    ]);
    expect(recordingsShown(panel)?.[0]?.text).toBe(
      "#1 session, ended, 3 packets, exported as unknown_fwunknown_settings-change-sound-off-a.jsonl",
    );
  });

  test("Discard drops an ended recording for good, but never the live one", async () => {
    const { clock, panel, connected } = connectTo(stubGatt(ACAIA_GATT));
    await connected;
    await advanceTo(clock, SUBSCRIBE_SETTLE_MS);
    click(panel, "disconnect");
    click(panel, "reconnect");
    await advanceTo(clock, 2 * SUBSCRIBE_SETTLE_MS);
    const discard = panel.onDiscard.mock.calls[0]?.[0];

    discard?.(2);
    discard?.(1);

    expect(recordingsShown(panel)?.map(({ id }) => id)).toEqual([2]);
    expect(exportFixture(panel, 1)).toBeUndefined();
    expect(panel.addError.mock.calls).toEqual([
      ["Recording #2 is live: disconnect first."],
      ["Choose a recording to export."],
    ]);
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
