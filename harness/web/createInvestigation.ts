import type { FixtureRecord } from "openpour/replay";
import { type CaptureFrames, captureFrames } from "./captureFrames.js";
import type { KnownCommand } from "./commandAvailability.js";
import { downloadText } from "./downloadText.js";
import { describeError } from "./explainFailure.js";
import { type Finding, findSettingBytes } from "./findSettingBytes.js";
import { fixtureDetails, identifierProblem } from "./fixtureDetails.js";
import { investigationFile } from "./investigationFile.js";

/** How long a step keeps recording after asking the scale, so its answer arrives. */
export const WIZARD_SETTLE_MS = 2000;

/** The investigation scenario every step exports its recording as. */
const SETTINGS_SCENARIO = "settings-change";

export const NOT_FOUND =
  "Scale not found: is the vendor app still connected? Close it and press Retry.";

/** What the wizard needs from its scale's card. */
export interface InvestigatedScale {
  /** The brand and matched name prefix, e.g. "Acaia PEARL": the results' `scale`. */
  readonly name: string;
  /** Closes the connection, if one is open. */
  disconnect(): Promise<void>;
  /** Connects the way Reconnect does; resolves to whether the session got ready. */
  connectReady(): Promise<boolean>;
  /** Sends one of the driver's commands, as its button does. */
  send(command: KnownCommand): void;
  wait(delayMs: number): Promise<void>;
  /** The newest recording's packets. */
  latestRecords(): readonly FixtureRecord[];
  /** Exports the newest recording; returns its file name. Throws when an answer is refused. */
  exportLatest(answers: FormData): string;
}

/** One step's evidence: the option set, the fixture exported, and the frames read. */
export interface Capture {
  option: string;
  fixtureFile: string;
  frames: CaptureFrames;
}

/** One setting's investigation in progress. */
export interface SettingRun {
  setting: string;
  options: readonly string[];
  /** What each step asks the scale with; undefined asks nothing. */
  command: KnownCommand | undefined;
  /** The option to set at each step: every option, then the first again. */
  plan: readonly string[];
  captures: readonly Capture[];
}

export interface SettingResult {
  setting: string;
  options: readonly string[];
  steps: readonly Capture[];
  findings: readonly Finding[];
}

export type WizardScreen =
  | { stage: "idle" }
  | { stage: "form" }
  | { stage: "step"; run: SettingRun; status: "waiting" | "reading" | "failed" }
  | { stage: "result"; result: SettingResult };

/** One scale's wizard. It lives with the scale, so reconnects keep it; a reload drops it. */
export interface InvestigationState {
  screen: WizardScreen;
  /** Every finished setting, for Export results. */
  results: readonly SettingResult[];
  /** Why the latest action did nothing, or how a step failed. */
  problem: string | undefined;
}

export const EMPTY_INVESTIGATION: InvestigationState = {
  screen: { stage: "idle" },
  results: [],
  problem: undefined,
};

/** The wizard's clicks. Reading and exporting carry the export form's answers. */
export type InvestigateAction =
  | { type: "open" }
  | { type: "start"; setting: string; options: string; command: KnownCommand | undefined }
  | { type: "read"; answers: FormData }
  | { type: "cancel" }
  | { type: "export"; answers: FormData };

/** "on, off" makes ["on", "off"]. */
function parseOptions(text: string): string[] {
  return text
    .split(",")
    .map((option) => option.trim())
    .filter((option) => option !== "");
}

/** "Auto-off" and "10 min" make "auto-off-10-min", a step's scenario detail. */
function stepDetail(setting: string, option: string): string {
  return `${setting}-${option}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function startProblem(setting: string, options: readonly string[]): string | undefined {
  if (setting === "") return "Name the setting.";
  if (options.length < 2) return "List at least two options, separated by commas.";
  if (new Set(options).size < options.length) return "List each option once.";
  const problems = [
    identifierProblem("setting", setting),
    ...options.map((option) => identifierProblem("option", option)),
  ];
  return problems.find((problem) => problem !== undefined);
}

/** Runs one scale's "Investigate a setting" wizard, showing every change through `show`. */
export function createInvestigation(
  scale: InvestigatedScale,
  show: (state: InvestigationState) => void,
): (action: InvestigateAction) => Promise<void> {
  let state = EMPTY_INVESTIGATION;

  /** Replaces part of the state and shows it; a change without a problem clears the last one. */
  function update(change: Partial<InvestigationState>): void {
    state = { ...state, problem: undefined, ...change };
    show(state);
  }

  async function start(setting: string, text: string, command: KnownCommand | undefined) {
    const options = parseOptions(text);
    const problem = startProblem(setting.trim(), options);
    if (problem) return update({ problem });
    await scale.disconnect();
    const [first = ""] = options;
    const run = { setting: setting.trim(), options, command, plan: [...options, first] };
    update({ screen: { stage: "step", run: { ...run, captures: [] }, status: "waiting" } });
  }

  /** Reads the scale for the step setting `option`: a capture, or why there is none. */
  async function capture(run: SettingRun, option: string, answers: FormData) {
    await scale.disconnect();
    try {
      if (!(await scale.connectReady())) return NOT_FOUND;
      if (run.command) scale.send(run.command);
      await scale.wait(WIZARD_SETTLE_MS);
      const frames = captureFrames(scale.latestRecords());
      if (Object.keys(frames).length === 0) return NOT_FOUND;
      // The repeat gets its own name, so its fixture never overwrites the first step's.
      const isRepeat = run.captures.length === run.plan.length - 1;
      answers.set("scenario", SETTINGS_SCENARIO);
      answers.set("scenarioDetail", stepDetail(run.setting, isRepeat ? `${option} again` : option));
      return { option, fixtureFile: scale.exportLatest(answers), frames };
    } catch (error) {
      return `Not captured: ${describeError(error)}`;
    } finally {
      await scale.disconnect();
    }
  }

  function finish(run: SettingRun, steps: readonly Capture[]): void {
    const { setting, options } = run;
    const result = { setting, options, steps, findings: findSettingBytes(setting, steps) };
    update({ screen: { stage: "result", result }, results: [...state.results, result] });
  }

  async function read(answers: FormData): Promise<void> {
    const { screen } = state;
    if (screen.stage !== "step" || screen.status === "reading") return;
    const { run } = screen;
    const option = run.plan[run.captures.length] ?? "";
    update({ screen: { ...screen, status: "reading" } });
    const outcome = await capture(run, option, answers);
    if (typeof outcome === "string") {
      return update({ screen: { ...screen, status: "failed" }, problem: outcome });
    }
    const captures = [...run.captures, outcome];
    if (captures.length < run.plan.length) {
      update({ screen: { stage: "step", run: { ...run, captures }, status: "waiting" } });
    } else {
      finish(run, captures);
    }
  }

  function exportResults(answers: FormData): void {
    try {
      const details = fixtureDetails(answers, scale.name);
      const { fileName, json } = investigationFile(
        state.results,
        details,
        new Date().toISOString(),
      );
      downloadText(fileName, json);
      update({});
    } catch (error) {
      update({ problem: `Export failed: ${describeError(error)}` });
    }
  }

  const isReading = (): boolean =>
    state.screen.stage === "step" && state.screen.status === "reading";

  return async (action) => {
    switch (action.type) {
      case "open":
        return update({ screen: { stage: "form" } });
      case "start":
        return start(action.setting, action.options, action.command);
      case "read":
        return read(action.answers);
      case "cancel":
        if (!isReading()) update({ screen: { stage: "idle" } });
        return;
      case "export":
        return exportResults(action.answers);
    }
  };
}
