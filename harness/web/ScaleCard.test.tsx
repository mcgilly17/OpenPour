// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { TooltipProvider } from "./components/ui/tooltip.js";
import { createScalePanel } from "./createScalePanel.js";
import { ScaleCard } from "./ScaleCard.js";
import type { SavedScale } from "./savedScales.js";
import { EMPTY_SWEEP, type SweepAction } from "./settingsSweep.js";

afterEach(cleanup);

const SAVED: SavedScale = {
  id: "Xq7Lm+Pz2wRk/5Ny0Ab==",
  name: "Acaia LUNAR",
  nickname: "Kitchen Lunar",
  model: "AL008",
  modelYear: "2021",
  firmware: "1.0.016",
};

/** Captures "sound" "off" after typing `model` into the export form; returns the answers sent. */
function captureWithModel(model: string, saved?: SavedScale): FormData | undefined {
  const panel = createScalePanel();
  const onSweep = vi.fn<(action: SweepAction) => void>();
  panel.onSweep(onSweep);
  panel.showSweep({ ...EMPTY_SWEEP, tracked: { svc: "s", chr: "n", prefix: [0xef], length: 3 } });
  render(
    <TooltipProvider>
      <ScaleCard panel={panel} saved={saved} onSave={() => undefined} />
    </TooltipProvider>,
  );

  fireEvent.change(screen.getByLabelText("Model"), { target: { value: model } });
  fireEvent.change(screen.getByLabelText("Setting"), { target: { value: "sound" } });
  fireEvent.change(screen.getByLabelText("Value"), { target: { value: "off" } });
  fireEvent.click(screen.getByRole("button", { name: "Capture" }));

  const action = onSweep.mock.calls[0]?.[0];
  expect(action).toMatchObject({ type: "capture", setting: "sound", value: "off" });
  return action?.type === "capture" ? action.answers : undefined;
}

describe("ScaleCard settings sweep", () => {
  test("a capture exports with the export form's current answers and the sweep's scenario", () => {
    const answers = captureWithModel("AL008");

    expect(answers?.get("model")).toBe("AL008");
    expect(answers?.get("scenario")).toBe("settings-change");
  });

  test("a saved scale's details win over the export form's, and nothing else of it is sent", () => {
    const answers = captureWithModel("typed for one export", SAVED);

    expect(answers?.get("model")).toBe("AL008");
    expect(JSON.stringify([...(answers?.entries() ?? [])])).not.toMatch(/Xq7Lm|Kitchen/);
  });
});
