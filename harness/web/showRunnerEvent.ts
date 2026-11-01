import type { Capabilities, Reading, ScaleEvent, ScaleInfo } from "openpour";
import type { RunnerEvent } from "../runner/startRunner.js";
import type { ScalePanel } from "./createScalePanel.js";
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

function showScaleEvent(panel: ScalePanel, event: ScaleEvent): void {
  if (event.type === "state") panel.show("protocol", event.state);
  if (event.type === "reading") panel.show("weight", describeReading(event.reading));
  if (event.type === "error") panel.addError(`Scale error ${describeError(event.error)}`);
}

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
      break;
  }
}
