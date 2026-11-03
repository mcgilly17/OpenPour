import { INFO_WAIT_MS } from "openpour/acaia";
import { bytesToHex } from "openpour/replay";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ACAIA_VECTORS as RX, ACAIA_COMMAND_VECTORS as TX } from "../../src/test/acaiaVectors.js";
import type { Clock } from "../runner/Clock.js";
import { ACAIA_WRITE } from "../test/acaiaGatt.js";
import { advanceTo } from "../test/useFakeClock.js";
import {
  type InvestigateAction,
  type InvestigationState,
  NOT_FOUND,
  WIZARD_SETTLE_MS,
} from "./createInvestigation.js";
import { WIZARD_READY_TIMEOUT_MS } from "./createScale.js";
import { downloadText } from "./downloadText.js";
import { RECONNECT_WINDOW_MS } from "./retryWhileOutOfRange.js";
import { type SavedScale, withSavedDetails } from "./savedScales.js";
import { type ConnectedScale, connectTo, notifyHex, pearlS } from "./test/connectScale.js";
import { characteristicOf, type StubGatt } from "./test/stubGatt.js";

vi.mock("./downloadText.js");

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// Shaped like Chrome's IDs, without a hex run the identifier check would catch anyway.
const DEVICE_ID = "Xq7Lm+Pz2wRk/5Ny0Ab==";
const SAVED: SavedScale = {
  id: DEVICE_ID,
  name: "Acaia PEARL",
  nickname: "Kitchen Pearl",
  model: "AL008",
  modelYear: "2021",
  firmware: "2.6",
};
/** Long enough for a step: connect, identify once no description came, ask, settle, export. */
const STEP_MS = INFO_WAIT_MS + WIZARD_SETTLE_MS + 500;

/** The settings frame with sound at byte 9, as the scale splits it. */
const settingsFrame = (sound: string): string => `efdd08095d02020100${sound}01000d60`;

/** Makes `gatt` answer like a scale: its settings after identify and when asked, then weights. */
function answerLikeAScale(gatt: StubGatt, clock: Clock, sound: () => string): void {
  const respond = async (value: BufferSource): Promise<void> => {
    const hex = bytesToHex(value as Uint8Array);
    if (hex !== TX.identify && hex !== TX.getSettings) return;
    const frame = settingsFrame(sound());
    notifyHex(gatt, frame.slice(0, 4), clock.now());
    notifyHex(gatt, frame.slice(4), clock.now());
    notifyHex(gatt, RX.weight, clock.now());
  };
  const write = characteristicOf(gatt, ACAIA_WRITE);
  write.writeValueWithoutResponse.mockImplementation(respond);
  write.writeValueWithResponse.mockImplementation(respond);
}

function investigate({ panel }: ConnectedScale, action: InvestigateAction): void {
  panel.onInvestigate.mock.calls[0]?.[0](action);
}

const shownState = ({ panel }: ConnectedScale): InvestigationState | undefined =>
  panel.showInvestigation.mock.calls.at(-1)?.[0];

const START: InvestigateAction = {
  type: "start",
  setting: "Sound",
  options: "on, off",
  command: "battery",
};

/** Connects a Pearl S that answers like a scale, with its sound set by `sound`. */
async function connectPearl(
  sound: () => string,
): Promise<{ scale: ConnectedScale; gatt: StubGatt }> {
  const gatt = pearlS();
  Object.assign(gatt.device, { id: DEVICE_ID });
  const scale = connectTo(gatt);
  answerLikeAScale(gatt, scale.clock, sound);
  await scale.connected;
  return { scale, gatt };
}

async function readStep(scale: ConnectedScale): Promise<void> {
  investigate(scale, { type: "read", answers: withSavedDetails(new FormData(), SAVED) });
  await advanceTo(scale.clock, scale.clock.now() + STEP_MS);
}

describe("createScale investigating a setting", () => {
  test("each step reconnects, asks the scale, exports the recording, and the result names the byte", async () => {
    let sound = "01";
    const { scale, gatt } = await connectPearl(() => sound);

    investigate(scale, START);
    await advanceTo(scale.clock, 100);
    for (const value of ["01", "00", "01"]) {
      sound = value;
      await readStep(scale);
    }

    expect(gatt.server.connect).toHaveBeenCalledTimes(4);
    expect(gatt.server.connected).toBe(false);
    expect(vi.mocked(downloadText).mock.calls.map(([fileName]) => fileName)).toEqual([
      "AL008_fw2.6_settings-change-sound-on-a.jsonl",
      "AL008_fw2.6_settings-change-sound-off-a.jsonl",
      "AL008_fw2.6_settings-change-sound-on-again-a.jsonl",
    ]);
    expect(shownState(scale)?.screen).toMatchObject({
      stage: "result",
      result: { findings: [{ kind: "efdd08", index: 9, follows: true }] },
    });
  });

  test("a step whose scale stays out of range for the reconnect window fails as not found", async () => {
    const { scale, gatt } = await connectPearl(() => "01");
    investigate(scale, START);
    await advanceTo(scale.clock, 100);
    const outOfRange = new DOMException("Bluetooth Device is no longer in range.", "NetworkError");
    gatt.server.connect.mockRejectedValue(outOfRange);

    investigate(scale, { type: "read", answers: new FormData() });
    await advanceTo(scale.clock, 100 + RECONNECT_WINDOW_MS + WIZARD_READY_TIMEOUT_MS);

    expect(shownState(scale)).toMatchObject({
      screen: { stage: "step", status: "failed" },
      problem: NOT_FOUND,
    });
    expect(downloadText).not.toHaveBeenCalled();
  });

  test("no download holds the device ID, the nickname or Device Information", async () => {
    let sound = "01";
    const { scale } = await connectPearl(() => sound);
    investigate(scale, START);
    await advanceTo(scale.clock, 100);
    for (const value of ["01", "00", "01"]) {
      sound = value;
      await readStep(scale);
    }

    investigate(scale, { type: "export", answers: withSavedDetails(new FormData(), SAVED) });

    const downloads = vi.mocked(downloadText).mock.calls;
    expect(downloads.at(-1)?.[0]).toBe("AL008_fw2.6_settings-investigation.json");
    const written = JSON.stringify(downloads);
    for (const secret of [DEVICE_ID, "Kitchen Pearl", "SERIAL", "PEARLS", "1.0.016"]) {
      expect(written).not.toContain(secret);
    }
  });
});
