import { acaia, NEW_STYLE_HEARTBEAT_MS, SUBSCRIBE_SETTLE_MS } from "openpour/acaia";
import { compareWrites, replay } from "openpour/replay";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ACAIA_VECTORS as RX, ACAIA_COMMAND_VECTORS as TX } from "../../src/test/acaiaVectors.js";
import { ACAIA_GATT, ACAIA_NOTIFY, ACAIA_SVC } from "../test/acaiaGatt.js";
import { advanceTo } from "../test/useFakeClock.js";
import { NEEDS_SESSION } from "./commandAvailability.js";
import {
  click,
  connectTo,
  DEVICE_INFO_READS,
  exportFixture,
  notifyHex,
  packetsLogged,
  pearlS,
  recordingsShown,
  shown,
  TWO_SERVICE_DISCOVERY,
  TYPE_7,
  writtenHex,
} from "./test/connectScale.js";
import { characteristicOf, operationsOn, stubGatt } from "./test/stubGatt.js";

vi.mock("./downloadText.js");

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const START_T = 1000;

describe("createScale listen-only", () => {
  test("subscribes only after createSession and Device Information, records an unsolicited frame, and sends nothing", async () => {
    const gatt = pearlS();
    const { clock, panel, connected } = connectTo(gatt, { mode: "listen" });
    await connected;
    await advanceTo(clock, 20);
    notifyHex(gatt, TYPE_7, 20);
    await advanceTo(clock, 10 * NEW_STYLE_HEARTBEAT_MS);

    const opened = [...TWO_SERVICE_DISCOVERY, ...DEVICE_INFO_READS];
    expect(operationsOn(gatt)).toEqual([...opened, "startNotifications"]);
    expect(writtenHex(gatt)).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(panel.setConnection).toHaveBeenLastCalledWith("listening");
    expect(panel.show).toHaveBeenLastCalledWith("protocol", "not started (listen-only)");
    expect(packetsLogged(panel)).toEqual([[1, "rx", TYPE_7]]);
    const fixture = exportFixture(panel, 1);
    expect(fixture?.header.sessionStartT).toBeUndefined();
    expect(fixture?.records).toEqual([
      { t: 20, dir: "rx", svc: ACAIA_SVC, chr: ACAIA_NOTIFY, hex: TYPE_7 },
    ]);
  });

  test("offers no driver command until the session starts", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    const { clock, panel, connected } = connectTo(gatt, { mode: "listen" });
    await connected;

    click(panel, "tare");
    click(panel, "battery");
    await advanceTo(clock, 100);

    expect(writtenHex(gatt)).toEqual([]);
    expect(panel.setCommands).toHaveBeenLastCalledWith({
      tare: NEEDS_SESSION,
      timerStart: NEEDS_SESSION,
      timerStop: NEEDS_SESSION,
      timerReset: NEEDS_SESSION,
      battery: NEEDS_SESSION,
    });
  });

  test("Start session takes the subscription over: one startNotifications, then the handshake, nothing recorded twice", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    const { clock, panel, connected } = connectTo(gatt, { mode: "listen" });
    await connected;
    await advanceTo(clock, 20);
    notifyHex(gatt, TYPE_7, 20);
    await advanceTo(clock, START_T);

    click(panel, "startSession");
    await advanceTo(clock, START_T + SUBSCRIBE_SETTLE_MS);
    notifyHex(gatt, RX.weight, START_T + SUBSCRIBE_SETTLE_MS);

    expect(characteristicOf(gatt, ACAIA_NOTIFY).startNotifications).toHaveBeenCalledOnce();
    expect(writtenHex(gatt)).toEqual([TX.identify, TX.notificationRequest]);
    expect(packetsLogged(panel)).toEqual([
      [1, "rx", TYPE_7],
      [2, "tx", TX.identify],
      [2, "tx", TX.notificationRequest],
      [2, "rx", RX.weight],
    ]);
    expect(shown(panel, "weight").at(-1)).toContain("175.9 g");
    expect(recordingsShown(panel)?.map(({ text }) => text)).toEqual([
      "#1 listen-only, ended, 1 packets",
      "#2 session, live",
    ]);
  });

  test("the session's recording starts at Start session and replays with the same writes", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    const { clock, panel, connected } = connectTo(gatt, { mode: "listen" });
    await connected;
    notifyHex(gatt, TYPE_7, 0);
    await advanceTo(clock, START_T);
    click(panel, "startSession");
    await advanceTo(clock, START_T + 2 * NEW_STYLE_HEARTBEAT_MS);

    const listened = exportFixture(panel, 1);
    const session = exportFixture(panel, 2);

    expect(listened?.records.map(({ hex }) => hex)).toEqual([TYPE_7]);
    expect(session?.header.sessionStartT).toBe(START_T);
    expect(session?.records[0]?.t).toBe(START_T + SUBSCRIBE_SETTLE_MS);
    if (!session) throw new Error("no session fixture");
    const { expected, produced } = compareWrites(
      replay(acaia.createSession(ACAIA_GATT), session),
      session,
    );
    expect(produced).toEqual(expected);
  });

  test("a scale that drops while listening ends the recording and keeps it; Start session does nothing", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    const { clock, panel, connected } = connectTo(gatt, { mode: "listen" });
    await connected;
    notifyHex(gatt, TYPE_7, 0);
    await advanceTo(clock, 2000);

    gatt.device.dispatchEvent(new Event("gattserverdisconnected"));
    click(panel, "startSession");
    await advanceTo(clock, 5000);

    expect(panel.setConnection).toHaveBeenLastCalledWith("disconnected");
    expect(writtenHex(gatt)).toEqual([]);
    expect(recordingsShown(panel)?.map(({ text }) => text)).toEqual([
      "#1 listen-only, ended, 1 packets",
    ]);
  });
});
