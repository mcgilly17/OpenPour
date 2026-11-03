// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { TooltipProvider } from "./components/ui/tooltip.js";
import { EMPTY_INVESTIGATION, type InvestigateAction } from "./createInvestigation.js";
import { createScalePanel } from "./createScalePanel.js";
import { ScaleCard } from "./ScaleCard.js";
import type { SavedScale } from "./savedScales.js";

afterEach(cleanup);

const SAVED: SavedScale = {
  id: "Xq7Lm+Pz2wRk/5Ny0Ab==",
  name: "Acaia LUNAR",
  nickname: "Kitchen Lunar",
  model: "AL008",
  modelYear: "2021",
  firmware: "1.0.016",
};

/** Shows step 2 of Sound's investigation, after "on" was captured. */
function renderStep(saved?: SavedScale) {
  const panel = createScalePanel();
  const onInvestigate = vi.fn<(action: InvestigateAction) => void>();
  panel.onInvestigate(onInvestigate);
  const capture = { option: "on", fixtureFile: "on.jsonl", frames: {} };
  const run = {
    setting: "Sound",
    options: ["on", "off"],
    command: "battery" as const,
    plan: ["on", "off", "on"],
    captures: [capture],
  };
  panel.showInvestigation({
    ...EMPTY_INVESTIGATION,
    screen: { stage: "step", run, status: "waiting" },
  });
  render(
    <TooltipProvider>
      <ScaleCard panel={panel} name="Acaia LUNAR" saved={saved} onSave={() => undefined} />
    </TooltipProvider>,
  );
  return onInvestigate;
}

/** Types `model` into the export form, then presses Done; returns the answers the step got. */
function readWithModel(model: string, saved?: SavedScale): FormData | undefined {
  const onInvestigate = renderStep(saved);
  fireEvent.change(screen.getByLabelText("Model"), { target: { value: model } });

  fireEvent.click(screen.getByRole("button", { name: "Done, read the scale" }));

  const action = onInvestigate.mock.calls[0]?.[0];
  return action?.type === "read" ? action.answers : undefined;
}

describe("ScaleCard investigating a setting", () => {
  test("a step says what to set in the vendor app, and what the last step captured", () => {
    renderStep();

    expect(screen.getByText("Sound = on captured")).toBeTruthy();
    const instruction = screen.getByText(/^Step 2 of 3/);
    expect(instruction.textContent).toBe(
      "Step 2 of 3 — In the vendor app, set Sound → off, then close the app.",
    );
    expect(instruction.querySelector("strong")?.textContent).toBe("Sound → off");
  });

  test("Done reads the scale with the export form's current answers", () => {
    expect(readWithModel("AL008")?.get("model")).toBe("AL008");
  });

  test("a saved scale's details win over the export form's, and nothing else of it is sent", () => {
    const answers = readWithModel("typed for one export", SAVED);

    expect(answers?.get("model")).toBe("AL008");
    expect(JSON.stringify([...(answers?.entries() ?? [])])).not.toMatch(/Xq7Lm|Kitchen/);
  });
});

/** Renders a card, lets `before` act on its export form, then has the scale report firmware 1.0.8. */
function firmwareAfterInfo(saved?: SavedScale, before: () => void = () => {}): string {
  const panel = createScalePanel();
  render(
    <TooltipProvider>
      <ScaleCard panel={panel} name="Acaia PEARL" saved={saved} onSave={() => undefined} />
    </TooltipProvider>,
  );
  before();
  act(() => panel.show("scaleFirmware", "1.0.8"));
  return (screen.getByLabelText("Firmware") as HTMLInputElement).value;
}

describe("ScaleCard export firmware", () => {
  test("starts from the firmware the scale reports when nothing else gave one", () => {
    expect(firmwareAfterInfo()).toBe("1.0.8");
    cleanup();
    expect(firmwareAfterInfo({ ...SAVED, firmware: "unknown" })).toBe("1.0.8");
  });

  test("keeps a saved scale's firmware", () => {
    expect(firmwareAfterInfo(SAVED)).toBe("1.0.016");
  });

  test("keeps what the contributor typed", () => {
    const typed = () =>
      fireEvent.change(screen.getByLabelText("Firmware"), { target: { value: "1.0.9" } });
    expect(firmwareAfterInfo(undefined, typed)).toBe("1.0.9");
  });
});
