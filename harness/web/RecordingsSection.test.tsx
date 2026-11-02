// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { scenarioOf } from "./fixtureDetails.js";
import { RecordingsSection } from "./RecordingsSection.js";
import type { SavedScale } from "./savedScales.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const RECORDINGS = [
  { id: 1, text: "#1 session, ended, 3 packets", canDiscard: true },
  { id: 2, text: "#2 session, live", canDiscard: false },
];

const SAVED: SavedScale = {
  id: "Xq7Lm+Pz2wRk/5Ny0Ab==",
  name: "Acaia LUNAR",
  nickname: "Kitchen Lunar",
  model: "AL008",
  modelYear: "2021",
  firmware: "1.0.016",
};

function renderSection(defaults?: SavedScale) {
  const onExport = vi.fn<(answers: FormData) => void>();
  const onDiscard = vi.fn<(recording: number) => void>();
  render(
    <RecordingsSection
      recordings={RECORDINGS}
      onExport={onExport}
      onDiscard={onDiscard}
      defaults={defaults}
    />,
  );
  const buttons = (name: string) => screen.getAllByRole("button", { name });
  return { onExport, onDiscard, buttons };
}

/** Opens the Scenario dropdown from the keyboard and picks `scenario`, as a contributor would. */
function chooseScenario(scenario: string): void {
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Scenario" }), { key: "Enter" });
  fireEvent.click(screen.getByRole("option", { name: scenario }));
}

describe("RecordingsSection", () => {
  test("exports the clicked recording with the scenario chosen from the dropdown and its detail", () => {
    const { onExport, buttons } = renderSection();

    chooseScenario("settings-change");
    fireEvent.change(screen.getByLabelText("Detail"), { target: { value: "sound-off" } });
    fireEvent.click(buttons("Export")[0] as HTMLElement);

    const answers = onExport.mock.calls[0]?.[0];
    expect(answers?.get("recording")).toBe("1");
    expect(answers && scenarioOf(answers)).toBe("settings-change-sound-off");
    expect(answers?.get("model")).toBe("unknown");
    expect(screen.getByRole("combobox", { name: "Scenario" }).textContent).toBe("settings-change");
  });

  test("starts from the saved scale's details, still editable, and exports only the form's answers", () => {
    const { onExport, buttons } = renderSection(SAVED);

    chooseScenario("smoke");
    fireEvent.change(screen.getByLabelText("Firmware"), { target: { value: "1.1.0" } });
    fireEvent.click(buttons("Export")[0] as HTMLElement);

    const answers = onExport.mock.calls[0]?.[0];
    expect(Object.fromEntries(answers?.entries() ?? [])).toEqual({
      model: "AL008",
      modelYear: "2021",
      firmware: "1.1.0",
      scenario: "smoke",
      scenarioDetail: "",
      recording: "1",
    });
  });

  test("offers every check ID and the investigations", () => {
    renderSection();

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Scenario" }), { key: "Enter" });
    const options = screen.getAllByRole("option").map(({ textContent }) => textContent);

    expect(options).toHaveLength(22);
    expect(options.slice(0, 2)).toEqual(["C1-connect", "C2-keeps-streaming"]);
    expect(options.slice(-4)).toEqual(["mode", "settings-change", "info-frame", "smoke"]);
  });

  test("the browser refuses an export without a scenario, or with a model year that isn't one", () => {
    const { onExport, buttons } = renderSection();

    fireEvent.click(buttons("Export")[0] as HTMLElement);
    chooseScenario("C7-app-tare");
    fireEvent.change(screen.getByLabelText("Model year"), { target: { value: "21" } });
    fireEvent.click(buttons("Export")[0] as HTMLElement);

    expect(onExport).not.toHaveBeenCalled();
  });

  test("Discard asks first, and the live recording can't be discarded", () => {
    const { onDiscard, buttons } = renderSection();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    const [ended, live] = buttons("Discard");
    fireEvent.click(ended as HTMLElement);

    expect(confirm).toHaveBeenCalledWith("Discard recording #1? It can't be recovered.");
    expect(onDiscard.mock.calls).toEqual([[1]]);
    expect(live).toHaveProperty("disabled", true);
  });
});
