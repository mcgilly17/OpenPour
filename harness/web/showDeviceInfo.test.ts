import { describe, expect, test } from "vitest";

import { showDeviceInfo } from "./showDeviceInfo.js";
import { stubPanel } from "./test/stubPanel.js";

describe("showDeviceInfo", () => {
  test("shows each field, unknown when missing, and fills model and firmware", () => {
    const panel = stubPanel();

    showDeviceInfo(panel, { info: { modelNumber: "PEARLS", firmwareRevision: "1.0.016" } });

    expect(panel.show.mock.calls).toEqual([
      ["manufacturer", "unknown"],
      ["modelNumber", "PEARLS"],
      ["firmwareRevision", "1.0.016"],
      ["hardwareRevision", "unknown"],
      ["softwareRevision", "unknown"],
    ]);
    expect(panel.prefill.mock.calls).toEqual([
      ["model", "PEARLS"],
      ["firmware", "1.0.016"],
    ]);
    expect(panel.addNote).not.toHaveBeenCalled();
  });

  test("fills firmware from the software revision when there's no firmware revision", () => {
    const panel = stubPanel();

    showDeviceInfo(panel, { info: { softwareRevision: "1.2.3" } });

    expect(panel.prefill.mock.calls).toEqual([["firmware", "1.2.3"]]);
  });

  test("notes a filled-in value that looks like a device identifier, and a stopped read", () => {
    const panel = stubPanel();
    const note = "Device Information stopped at firmwareRevision (timed out)";

    showDeviceInfo(panel, { info: { modelNumber: "PEARLS-D9F8BC" }, note });

    expect(panel.addNote.mock.calls).toEqual([
      [expect.stringContaining(`model "PEARLS-D9F8BC" contains D9F8BC`)],
      [note],
    ]);
  });
});
