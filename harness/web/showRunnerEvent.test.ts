import type { Reading, ScaleEvent } from "openpour";
import { describe, expect, test } from "vitest";

import { EMPTY_FIELD, type PanelField } from "./createScalePanel.js";
import { describeScaleEvent, showRunnerEvent } from "./showRunnerEvent.js";
import { type StubPanel, stubPanel } from "./test/stubPanel.js";

function shown(panel: StubPanel, field: PanelField): string[] {
  return panel.show.mock.calls.flatMap(([name, text]) => (name === field ? [text] : []));
}

const GRAMS: Reading = { t: 0, value: 116.4, unit: "g", decimals: 1, stable: true, flowPerSec: 0 };
const OUNCES: Reading = {
  t: 0,
  value: 4.18,
  unit: "oz",
  decimals: 3,
  stable: false,
  flowPerSec: 0.03,
};

function showAll(...events: ScaleEvent[]) {
  const panel = stubPanel();
  for (const event of events) showRunnerEvent(panel, { type: "scale", t: 0, event });
  return panel;
}

describe("showRunnerEvent", () => {
  test("shows weight and flow in the scale's own unit, with its decimals", () => {
    const panel = showAll(
      { type: "reading", reading: GRAMS },
      { type: "reading", reading: OUNCES },
    );

    expect(shown(panel, "weight")).toEqual(["116.4 g, stable", "4.180 oz"]);
    expect(shown(panel, "flow")).toEqual(["0.0 g/s", "0.030 oz/s"]);
  });

  test("shows what the scale says about itself, and keeps it after a disconnect", () => {
    const panel = showAll({ type: "info", firmware: "1.0.8", modelCode: "035c" });
    showRunnerEvent(panel, { type: "disconnected", t: 1 });

    expect(shown(panel, "scaleFirmware")).toEqual(["1.0.8"]);
    expect(shown(panel, "modelCode")).toEqual(["035c"]);
    expect(shown(panel, "flow").at(-1)).toBe(EMPTY_FIELD);
  });
});

describe("describeScaleEvent", () => {
  test("a log row names the unit of the weight and the flow", () => {
    expect(describeScaleEvent({ type: "reading", reading: OUNCES })).toBe(
      "reading 4.180 oz, flow 0.030 oz/s",
    );
  });

  test("a log row shows the scale's firmware and model code", () => {
    expect(describeScaleEvent({ type: "info", firmware: "1.0.19", modelCode: "021a" })).toBe(
      "info firmware 1.0.19, model code 021a",
    );
  });
});
