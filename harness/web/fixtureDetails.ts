import packageJson from "openpour/package.json" with { type: "json" };
import type { FixtureDetails } from "../runner/createRecorder.js";

/** The fixture header's `tool`: this harness and the OpenPour version that recorded it. */
export const HARNESS_TOOL: string = `openpour web harness ${packageJson.version}`;

/**
 * Six or more hex digits in a row look like part of a hardware address or a serial number, such
 * as the suffix of an advertised name like PEARLSD9F8BC. Compact dates match too: rewording one is
 * cheaper than publishing an identifier.
 */
export const IDENTIFIER_LIKE: RegExp = /[0-9a-f]{6,}/i;

const YEAR = /^\d{4}$/;

/** The answers that end up in a public fixture as typed. */
const FREE_TEXT_ANSWERS = ["model", "firmware", "scenario"] as const;

/** Why `value`, the answer for `name`, can't go into a public fixture; undefined when it can. */
export function identifierProblem(name: string, value: string): string | undefined {
  const run = IDENTIFIER_LIKE.exec(value)?.[0];
  if (run === undefined) return undefined;
  return `${name} "${value}" contains ${run}, which looks like a device identifier (6 or more hex digits in a row). Fixtures are public: remove it.`;
}

/** The chosen scenario, with the optional free-text detail appended, e.g. "C12-units-oz". */
export function scenarioOf(answers: FormData): string {
  const text = (name: string): string => {
    const value = answers.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const scenario = text("scenario") || "unknown";
  const detail = text("scenarioDetail");
  return detail === "" ? scenario : `${scenario}-${detail}`;
}

/**
 * The export form's answers as fixture header details. Blank answers count as "unknown". Throws
 * when an answer looks like it contains a device identifier.
 */
export function fixtureDetails(answers: FormData, brand: string): FixtureDetails {
  const answer = (name: string): string => {
    const value = answers.get(name);
    return typeof value === "string" && value.trim() !== "" ? value.trim() : "unknown";
  };
  const values = {
    model: answer("model"),
    firmware: answer("firmware"),
    scenario: scenarioOf(answers),
  };
  for (const name of FREE_TEXT_ANSWERS) {
    const problem = identifierProblem(name, values[name]);
    if (problem) throw new Error(problem);
  }
  const modelYear = answer("modelYear");
  return {
    brand,
    model: values.model,
    ...(YEAR.test(modelYear) ? { modelYear: Number(modelYear) } : {}),
    firmware: values.firmware,
    captured: new Date().toISOString().slice(0, 10),
    tool: HARNESS_TOOL,
    scenario: values.scenario,
  };
}
