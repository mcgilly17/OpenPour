import { describe, expect, test } from "vitest";

import { fixtureDetails, scenarioOf } from "./fixtureDetails.js";

function form(entries: Record<string, string>): FormData {
  const answers = new FormData();
  for (const [name, value] of Object.entries(entries)) answers.set(name, value);
  return answers;
}

describe("scenarioOf", () => {
  test("joins the chosen scenario and its detail", () => {
    expect(scenarioOf(form({ scenario: "C12-units", scenarioDetail: " oz " }))).toBe(
      "C12-units-oz",
    );
  });

  test("uses the scenario alone without a detail, and unknown without either", () => {
    expect(scenarioOf(form({ scenario: "mode", scenarioDetail: "" }))).toBe("mode");
    expect(scenarioOf(form({}))).toBe("unknown");
  });
});

describe("fixtureDetails", () => {
  test("refuses a detail that looks like a device identifier", () => {
    const answers = form({ scenario: "mode", scenarioDetail: "D9F8BC" });

    expect(() => fixtureDetails(answers, "Acaia")).toThrow(/scenario "mode-D9F8BC"/);
  });
});
