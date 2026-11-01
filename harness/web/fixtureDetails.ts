import packageJson from "openpour/package.json" with { type: "json" };
import type { FixtureDetails } from "../runner/createRecorder.js";

/** The fixture header's `tool`: this harness and the OpenPour version that recorded it. */
export const HARNESS_TOOL: string = `openpour web harness ${packageJson.version}`;

const YEAR = /^\d{4}$/;

/** The export form's answers as fixture header details. Blank answers count as "unknown". */
export function fixtureDetails(answers: FormData, brand: string): FixtureDetails {
  const answer = (name: string): string => {
    const value = answers.get(name);
    return typeof value === "string" && value.trim() !== "" ? value.trim() : "unknown";
  };
  const modelYear = answer("modelYear");
  return {
    brand,
    model: answer("model"),
    ...(YEAR.test(modelYear) ? { modelYear: Number(modelYear) } : {}),
    firmware: answer("firmware"),
    captured: new Date().toISOString().slice(0, 10),
    tool: HARNESS_TOOL,
    scenario: answer("scenario"),
  };
}
