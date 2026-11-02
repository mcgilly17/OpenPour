import type { Driver } from "openpour";
import type { Clock } from "../runner/Clock.js";
import { createListeningSource, type ListeningSource } from "../runner/createListeningSource.js";
import { type Packet, type Runner, type RunnerEvent, startRunner } from "../runner/startRunner.js";
import { type Characteristic, subscriptionsOnStart } from "../runner/subscriptionsOnStart.js";
import { commandAvailability, KNOWN_COMMANDS, type KnownCommand } from "./commandAvailability.js";
import {
  createRecordings,
  describeRecording,
  type Recording,
  type RecordingKind,
} from "./createRecordings.js";
import {
  type ConnectionControls,
  type ConnectionState,
  EMPTY_FIELD,
  type ScalePanel,
} from "./createScalePanel.js";
import { createWebBluetoothSource } from "./createWebBluetoothSource.js";
import { downloadText } from "./downloadText.js";
import { describeError, explainConnectFailure } from "./explainFailure.js";
import { findEarlierRuns } from "./findEarlierRuns.js";
import { fixtureDetails } from "./fixtureDetails.js";
import { type OpenedSession, openSession } from "./openSession.js";
import { retryWhileOutOfRange } from "./retryWhileOutOfRange.js";
import { showDeviceInfo } from "./showDeviceInfo.js";
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

/**
 * "session" starts the driver's session at once. "listen" subscribes to what the session would
 * and records what arrives, sending nothing until Start session.
 */
export type ConnectMode = "session" | "listen";

/** One connection: its session, which starts at once or after listening, and its recording. */
interface Connection {
  opened: OpenedSession;
  source: ListeningSource;
  /** Packets go here: the listen-only recording, then the session's. */
  recording: Recording;
  runner: Runner | undefined;
  isClosed: boolean;
}

/** A connection attempt in flight, which may be waiting for the scale to advertise. */
interface Attempt {
  cancel(): void;
  isWaiting: boolean;
}

export interface Scale {
  /**
   * Connects with a fresh session and recording. A scale that isn't advertising yet, such as one
   * just switched on, is retried until it does, for up to RECONNECT_WINDOW_MS, or until Cancel.
   * Failures are shown, never thrown. Does nothing while a connection is open or being opened.
   */
  connect(mode: ConnectMode): Promise<void>;
}

const SEND: Record<KnownCommand, (runner: Runner) => void> = {
  tare: (runner) => runner.tare(),
  timerStart: (runner) => runner.timer.start(),
  timerStop: (runner) => runner.timer.stop(),
  timerReset: (runner) => runner.timer.reset(),
  battery: (runner) => runner.requestBattery(),
};

/**
 * The brand and the name prefix the device matched, e.g. "Acaia PEARL". The rest of an advertised
 * name can be derived from the scale's address, so it is never shown where it could be copied.
 */
function publicName(driver: Driver, name: string | undefined): string {
  const prefix = driver.namePrefixes.find((namePrefix) => name?.startsWith(namePrefix));
  return prefix === undefined ? driver.brand : `${driver.brand} ${prefix}`;
}

/** Connects one chosen device and wires its panel: controls, readouts, log and recordings. */
export function createScale(options: ScaleOptions): Scale {
  const { device, label, driver, clock, recordingStartT, panel } = options;
  const recordings = createRecordings({ label, recordingStartT });
  let connection: Connection | undefined;
  let attempt: Attempt | undefined;

  function showRecordings(): void {
    const summary = (recording: Recording) => ({
      id: recording.id,
      text: describeRecording(recording),
      canDiscard: !recording.isLive,
    });
    panel.showRecordings(recordings.all().map(summary));
  }

  function isOpen(conn: Connection | undefined): conn is Connection {
    return conn !== undefined && !conn.isClosed;
  }

  /** Which connection buttons work now, from the same state connect and startSession check. */
  function controls(): ConnectionControls {
    const canOpen = attempt === undefined && !isOpen(connection);
    return {
      disconnect: isOpen(connection),
      reconnect: canOpen,
      listen: canOpen,
      startSession: isOpen(connection) && connection.runner === undefined,
      cancel: attempt?.isWaiting === true,
    };
  }

  function showConnection(state: ConnectionState): void {
    panel.setConnection(state);
    panel.setControls(controls());
  }

  function availability() {
    const isRunning = connection?.runner !== undefined && !connection.isClosed;
    return commandAvailability(connection?.opened.session.capabilities, isRunning);
  }

  function startRecording(kind: RecordingKind, { session }: OpenedSession): Recording {
    const recording = recordings.start(kind, session.info.brand);
    showRecordings();
    return recording;
  }

  function mark(recording: Recording, t: number, text: string): void {
    panel.log({ kind: "marker", t: t - recording.startT, text });
  }

  function logPacket(recording: Recording, packet: Packet): void {
    panel.log({ kind: "packet", recording: recording.id, record: recording.recorder.add(packet) });
  }

  function closed(conn: Connection, t: number): void {
    if (conn.isClosed) return;
    conn.isClosed = true;
    conn.recording.isLive = false;
    mark(conn.recording, t, "disconnected");
    showRunnerEvent(panel, { type: "disconnected", t });
    panel.setControls(controls());
    showRecordings();
    panel.setCommands(availability());
  }

  function onRunnerEvent(conn: Connection, recording: Recording, event: RunnerEvent): void {
    switch (event.type) {
      case "started":
        recording.recorder.sessionStarted(event.t);
        mark(recording, event.t, `#${recording.id} session started`);
        break;
      case "packet":
        logPacket(recording, event.packet);
        break;
      case "disconnected":
        closed(conn, event.t);
        break;
      case "scale":
        panel.log({ kind: "event", t: event.t - recording.startT, event: event.event });
        showRunnerEvent(panel, event);
        break;
      default:
        showRunnerEvent(panel, event);
    }
  }

  function runSession(conn: Connection): void {
    const { recording } = conn;
    conn.runner = startRunner({
      source: conn.source,
      session: conn.opened.session,
      clock,
      onEvent: (event) => onRunnerEvent(conn, recording, event),
    });
    showConnection("connected");
    panel.setCommands(availability());
  }

  /** From listening: starts the session's own recording, then the session, which takes over. */
  function startSession(): void {
    const conn = connection;
    if (!conn || conn.runner || conn.isClosed) return;
    conn.recording = startRecording("session", conn.opened);
    runSession(conn);
  }

  function listenTargets({ opened }: Connection, t: number): Characteristic[] {
    try {
      return subscriptionsOnStart(driver.createSession(opened.layout), t);
    } catch (error) {
      panel.addError(`Couldn't tell what the session subscribes to: ${describeError(error)}`);
      return [];
    }
  }

  async function listenTo(conn: Connection, targets: Characteristic[]): Promise<void> {
    const { recording } = conn;
    for (const { svc, chr } of targets) {
      // Once the session runs, it subscribes for itself.
      if (conn.runner || conn.isClosed) return;
      const onNotification = (bytes: Uint8Array, t: number): void => {
        if (!conn.isClosed) logPacket(recording, { t, dir: "rx", svc, chr, bytes });
      };
      try {
        await conn.source.listen(svc, chr, onNotification);
      } catch (error) {
        const command = { type: "subscribe", svc, chr } as const;
        showRunnerEvent(panel, { type: "commandFailed", t: clock.now(), command, error });
      }
    }
  }

  function listen(conn: Connection): void {
    const t = clock.now();
    const targets = listenTargets(conn, t);
    showConnection("listening");
    panel.show("protocol", "not started (listen-only)");
    panel.setCommands(availability());
    mark(conn.recording, t, `#${conn.recording.id} listen-only: subscribing, sending nothing`);
    if (targets.length === 0) panel.addNote("The session subscribes to nothing when it starts.");
    void listenTo(conn, targets);
  }

  function begin(opened: OpenedSession, mode: ConnectMode): void {
    panel.show("info", describeInfo(opened.session.info));
    panel.show("capabilities", describeCapabilities(opened.session.capabilities));
    showDeviceInfo(panel, opened.deviceInfo);
    const { server, characteristics } = opened;
    const web = createWebBluetoothSource({ server, characteristics, clock });
    const conn: Connection = {
      opened,
      source: createListeningSource(web, clock),
      recording: startRecording(mode === "listen" ? "listen-only" : "session", opened),
      runner: undefined,
      isClosed: false,
    };
    conn.source.onDisconnect(() => closed(conn, clock.now()));
    connection = conn;
    if (mode === "listen") listen(conn);
    else runSession(conn);
  }

  /** Opens a session, waiting for a scale that isn't advertising yet, until `signal` aborts. */
  async function open(signal: AbortSignal, current: Attempt): Promise<OpenedSession> {
    const onWaiting = () => {
      current.isWaiting = true;
      showConnection("waiting");
    };
    const attempt = () => openSession(device, driver, clock);
    const opened = await retryWhileOutOfRange(attempt, { clock, signal, onWaiting });
    if (signal.aborted) {
      // Cancelled while this last attempt was in flight.
      opened.server.disconnect();
      throw signal.reason;
    }
    return opened;
  }

  function showConnectFailure(error: unknown, isCancelled: boolean): void {
    panel.show("weight", EMPTY_FIELD);
    if (isCancelled) {
      showConnection("disconnected");
      return;
    }
    showConnection("failed");
    panel.addError(explainConnectFailure(error, driver));
  }

  async function connect(mode: ConnectMode): Promise<void> {
    // A second runner would drive the same scale twice. Closing the open connection instead would
    // end its live recording unasked, so a connect while one is open or opening does nothing.
    if (attempt || isOpen(connection)) return;
    const cancelling = new AbortController();
    const current: Attempt = { cancel: () => cancelling.abort(), isWaiting: false };
    attempt = current;
    showConnection("connecting");
    panel.show("protocol", EMPTY_FIELD);
    try {
      const opened = await open(cancelling.signal, current);
      attempt = undefined;
      begin(opened, mode);
    } catch (error) {
      attempt = undefined;
      showConnectFailure(error, cancelling.signal.aborted);
    }
  }

  function disconnect(): void {
    if (!connection) return;
    void (connection.runner ?? connection.source).disconnect();
  }

  function send(command: KnownCommand): void {
    const runner = connection?.runner;
    // Disabled buttons can't be clicked; this also holds for a driver that wouldn't refuse.
    if (runner && availability()[command] === undefined) SEND[command](runner);
  }

  function exportFixture(answers: FormData): void {
    const recording = recordings.find(Number(answers.get("recording")));
    if (!recording) {
      panel.addError("Choose a recording to export.");
      return;
    }
    try {
      const details = fixtureDetails(answers, recording.brand);
      const { fileName, jsonl } = recording.recorder.export(details);
      downloadText(fileName, jsonl);
      recording.exportedAs = fileName;
      showRecordings();
    } catch (error) {
      panel.addError(`Export failed: ${describeError(error)}`);
    }
  }

  function discard(id: number): void {
    if (!recordings.discard(id)) panel.addError(`Recording #${id} is live: disconnect first.`);
    showRecordings();
  }

  panel.show("title", `Scale ${label}: ${publicName(driver, device.name)}`);
  panel.setCommands(availability());
  panel.setControls(controls());
  for (const command of KNOWN_COMMANDS) panel.onAction(command, () => send(command));
  panel.onAction("disconnect", disconnect);
  panel.onAction("reconnect", () => void connect("session"));
  panel.onAction("listen", () => void connect("listen"));
  panel.onAction("startSession", startSession);
  panel.onAction("cancel", () => attempt?.cancel());
  panel.onExport(exportFixture);
  panel.onDiscard(discard);
  panel.onFindEarlier((run, prefixBytes) => {
    const searched = recordings
      .all()
      .map(({ id, recorder }) => ({ id, records: recorder.records() }));
    return findEarlierRuns(searched, run, prefixBytes);
  });
  return { connect };
}
