import type { Capabilities, Reading, ScaleEvent, ScaleInfo } from "openpour";
import type { RunnerEvent } from "../runner/startRunner.js";
import { EMPTY_FIELD, type ScalePanel } from "./createScalePanel.js";
import { describeError } from "./explainFailure.js";

export function describeInfo({ brand, model, firmware }: ScaleInfo): string {
  return `${brand} ${model}, firmware ${firmware ?? "unknown"}`;
}

export function describeCapabilities(capabilities: Capabilities): string {
  const { tare, timer, battery, resolutionGrams, maxRateHz } = capabilities;
  const flags = Object.entries({ tare, timer, battery }).map(
    ([name, has]) => `${name} ${has ? "yes" : "no"}`,
  );
  return [...flags, `${resolutionGrams} g resolution`, `up to ${maxRateHz} Hz`].join(", ");
}

/** The decoded value as is: rounding here could hide a decoding fault. */
function describeReading({ grams, stable }: Reading): string {
  return `${grams} g${stable ? ", stable" : ""}`;
}

type TimerEvent = Extract<ScaleEvent, { type: "timer" }>;

function describeTimer({ running, ms }: TimerEvent): string {
  return `${running ? "running" : "stopped"}, ${ms / 1000} s`;
}

/** One line for a log row, from the decoded event alone. */
export function describeScaleEvent(event: ScaleEvent): string {
  switch (event.type) {
    case "reading":
      return `reading ${describeReading(event.reading)}`;
    case "battery":
      return `battery ${event.percent} %`;
    case "timer":
      return `timer ${describeTimer(event)}`;
    case "button":
      return `button ${event.button}`;
    case "state":
      return `state ${event.state}`;
    case "error":
      return `error ${describeError(event.error)}`;
  }
}

function showScaleEvent(panel: ScalePanel, event: ScaleEvent): void {
  if (event.type === "state") panel.show("protocol", event.state);
  if (event.type === "reading") panel.show("weight", describeReading(event.reading));
  if (event.type === "timer") panel.show("timer", describeTimer(event));
  if (event.type === "battery") panel.show("battery", `${event.percent} %`);
  if (event.type === "error") panel.addError(`Scale error ${describeError(event.error)}`);
}

/** Readouts that come from the scale's events, so none outlives the connection. */
const LIVE_FIELDS = ["weight", "timer", "battery"] as const;

/** Shows what the runner reports; the start time and packets go to the recorder instead. */
export function showRunnerEvent(
  panel: ScalePanel,
  event: Exclude<RunnerEvent, { type: "started" | "packet" }>,
): void {
  switch (event.type) {
    case "scale":
      showScaleEvent(panel, event.event);
      break;
    case "commandFailed":
      panel.addError(
        `${event.command.type} ${event.command.chr} failed: ${describeError(event.error)}`,
      );
      break;
    case "sessionThrew":
      panel.addError(`The session threw ${describeError(event.error)}`);
      break;
    case "disconnected":
      panel.setConnection("disconnected");
      for (const field of LIVE_FIELDS) panel.show(field, EMPTY_FIELD);
      break;
  }
}
