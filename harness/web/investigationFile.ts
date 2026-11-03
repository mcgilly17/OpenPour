import { type FixtureDetails, fileNamePart } from "../runner/createRecorder.js";
import type { SettingResult } from "./createInvestigation.js";

export interface InvestigationFile {
  /** `<model>_fw<firmware>_settings-investigation.json`, like a fixture's name. */
  fileName: string;
  json: string;
}

function settingOf({ setting, options, steps, findings }: SettingResult) {
  return {
    setting,
    options: [...options],
    steps: steps.map(({ option, fixtureFile, frames }) => ({
      option,
      fixtureFile,
      frames: Object.fromEntries(Object.entries(frames).map(([kind, { frame }]) => [kind, frame])),
    })),
    findings: findings.map(({ kind, index, values, follows, note }) => ({
      kind,
      index,
      values: { ...values },
      follows,
      note,
    })),
  };
}

/**
 * Every finished setting as one JSON file. Built field by field from `details`, whose brand is the
 * card's public name, so no device ID, nickname or Device Information can reach it.
 */
export function investigationFile(
  results: readonly SettingResult[],
  details: FixtureDetails,
  exportedAt: string,
): InvestigationFile {
  const { brand, model, modelYear, firmware } = details;
  const header = {
    scale: brand,
    model,
    ...(modelYear === undefined ? {} : { modelYear }),
    firmware,
    exportedAt,
  };
  const file = { header, settings: results.map(settingOf) };
  const name = [model, `fw${firmware}`, "settings-investigation"].map(fileNamePart).join("_");
  return { fileName: `${name}.json`, json: `${JSON.stringify(file, null, 2)}\n` };
}
