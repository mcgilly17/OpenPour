import type { Driver, ScaleSession } from "openpour";
import type { Clock } from "../runner/Clock.js";
import { createRecorder, type Recorder } from "../runner/createRecorder.js";
import { type Runner, startRunner } from "../runner/startRunner.js";
import { EMPTY_FIELD, type ScalePanel } from "./createScalePanel.js";
import { createWebBluetoothSource } from "./createWebBluetoothSource.js";
import { downloadText } from "./downloadText.js";
import { describeError, explainConnectFailure } from "./explainFailure.js";
import { fixtureDetails } from "./fixtureDetails.js";
import { type OpenedSession, openSession } from "./openSession.js";
import { describeCapabilities, describeInfo, showRunnerEvent } from "./showRunnerEvent.js";

export interface ScaleOptions {
  device: BluetoothDevice;
  /** Tells scales apart on the page and in fixture names: "a", "b"… Never a device ID. */
  label: string;
  driver: Driver;
  clock: Clock;
  /** The recording's shared start, so the scales' fixture times line up. */
  recordingStartT: () => number;
  panel: ScalePanel;
}

/** One connection: its own session, runner and recording. */
interface Connection {
  session: ScaleSession;
  runner: Runner;
  recorder: Recorder;
}

export interface Scale {
  /** Connects with a fresh session, runner and recording. Failures are shown, never thrown. */
  connect(): Promise<void>;
}

/**
 * The brand and the name prefix the device matched, e.g. "Acaia PEARL". The rest of an advertised
 * name can be derived from the scale's address, so it is never shown where it could be copied.
 */
function publicName(driver: Driver, name: string | undefined): string {
  const prefix = driver.namePrefixes.find((namePrefix) => name?.startsWith(namePrefix));
  return prefix === undefined ? driver.brand : `${driver.brand} ${prefix}`;
}

/** Connects one chosen device and wires its panel: controls, readouts and fixture export. */
export function createScale(options: ScaleOptions): Scale {
  const { device, label, driver, clock, recordingStartT, panel } = options;
  let connection: Connection | undefined;

  function start({ server, characteristics, session }: OpenedSession): Connection {
    const recorder = createRecorder({ startT: recordingStartT(), label });
    panel.show("info", describeInfo(session.info));
    panel.show("capabilities", describeCapabilities(session.capabilities));
    const runner = startRunner({
      source: createWebBluetoothSource({ server, characteristics, clock }),
      session,
      clock,
      onEvent(event) {
        if (event.type === "started") recorder.sessionStarted(event.t);
        else if (event.type === "packet") recorder.add(event.packet);
        else showRunnerEvent(panel, event);
      },
    });
    return { session, runner, recorder };
  }

  async function connect(): Promise<void> {
    panel.setConnection("connecting");
    panel.show("protocol", EMPTY_FIELD);
    try {
      connection = start(await openSession(device, driver, clock));
      panel.setConnection("connected");
    } catch (error) {
      panel.setConnection("failed");
      panel.show("weight", EMPTY_FIELD);
      panel.addError(explainConnectFailure(error, driver));
    }
  }

  function exportFixture(answers: FormData): void {
    if (!connection) {
      panel.addError("Nothing is recorded yet: connect the scale first.");
      return;
    }
    try {
      const details = fixtureDetails(answers, connection.session.info.brand);
      const { fileName, jsonl } = connection.recorder.export(details);
      downloadText(fileName, jsonl);
    } catch (error) {
      panel.addError(`Export failed: ${describeError(error)}`);
    }
  }

  panel.show("title", `Scale ${label}: ${publicName(driver, device.name)}`);
  panel.onAction("tare", () => connection?.runner.tare());
  panel.onAction("disconnect", () => void connection?.runner.disconnect());
  panel.onAction("reconnect", () => void connect());
  panel.onExport(exportFixture);
  return { connect };
}
