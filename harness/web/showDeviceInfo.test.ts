import { describe, expect, test } from "vitest";

import { showDeviceInfo } from "./showDeviceInfo.js";
import { stubPanel } from "./test/stubPanel.js";

describe("showDeviceInfo", () => {
  test("shows each field, unknown when missing", () => {
    const panel = stubPanel();

    showDeviceInfo(panel, { info: { manufacturer: "MCHP", modelNumber: "BM70" } });

    expect(panel.show.mock.calls).toEqual([
      ["manufacturer", "MCHP"],
      ["modelNumber", "BM70"],
      ["firmwareRevision", "unknown"],
      ["hardwareRevision", "unknown"],
      ["softwareRevision", "unknown"],
    ]);
    expect(panel.addNote).not.toHaveBeenCalled();
  });

  test("notes a stopped read", () => {
    const panel = stubPanel();
    const note = "Device Information stopped at firmwareRevision (timed out)";

    showDeviceInfo(panel, { info: {}, note });

    expect(panel.addNote.mock.calls).toEqual([[note]]);
  });
});
