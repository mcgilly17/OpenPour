import { OpenPourError } from "../../core/errors.js";
import { createFlowFilter } from "../../core/flow.js";
import type {
  Capabilities,
  Command,
  ScaleEvent,
  ScaleSession,
  Step,
  WeightUnit,
} from "../../core/types.js";
import { type AcaiaCommand, commands } from "./commands.js";
import { createFrameReader, type Frame } from "./createFrameReader.js";
import { createTimerTracker } from "./createTimerTracker.js";
import { type AcaiaMessage, type AcaiaRecord, decodeMessage } from "./decodeMessage.js";
import { type AcaiaVariant, normalizeUuid } from "./findVariant.js";

/**
 * How long after subscribing to wait for the scale to describe itself (its firmware and model
 * code) before identifying anyway. Unidentified, the Pearl S repeats it about every 0.5 s and the
 * Lunar about every 1.15 s; identifying stops it.
 */
export const INFO_WAIT_MS = 1500;
/** No frame for this long means the scale stopped talking; reported once as a timeout error. */
export const SILENCE_TIMEOUT_MS = 5000;
/** How long to wait for asked-for settings before asking again. The Pearl S answers within 200 ms. */
export const SETTINGS_REPLY_TIMEOUT_MS = 1000;
/**
 * The decimals each unit's weights carry on the Pearl S and the Lunar. Weights with other decimals
 * mean the unit was switched on the scale, which sends no new settings.
 */
export const UNIT_DECIMALS: Readonly<Record<WeightUnit, number>> = { g: 1, oz: 3 };

const NOT_IDENTIFIED_TYPE = 7;

const CAPABILITIES: Capabilities = {
  tare: true,
  timer: true,
  battery: true,
  resolutionGrams: 0.1,
  maxRateHz: 10,
};

type Phase = "waitingForInfo" | "handshaking" | "ready";
type Weight = Extract<AcaiaRecord, { kind: "weight" }>;

interface Output {
  events: ScaleEvent[];
  commands: Command[];
}

const NOTHING: Output = { events: [], commands: [] };

function only(...events: ScaleEvent[]): Output {
  return { events, commands: [] };
}

function merge(outputs: Output[]): Output {
  return {
    events: outputs.flatMap((o) => o.events),
    commands: outputs.flatMap((o) => o.commands),
  };
}

/** Whether a weight record follows record `i` in the same message (see `TimerTracker`). */
function isAheadOfWeight(records: AcaiaRecord[], i: number): boolean {
  return records.slice(i + 1).some((r) => r.kind === "weight");
}

/** One connected Acaia scale. The variant comes from the GATT layout (see `findVariant`). */
export function createAcaiaSession(variant: AcaiaVariant): ScaleSession {
  const reader = createFrameReader();
  const flow = createFlowFilter();
  const timer = createTimerTracker();
  const notifyChr = normalizeUuid(variant.notifyChr);
  let phase: Phase = "waitingForInfo";
  let wakeAt = 0;
  let lastFrameAt = 0;
  let isSilent = false;
  let hasReportedInfo = false;
  /** The unit the last settings gave; undefined before any, and while a unit switch is confirmed. */
  let unit: WeightUnit | undefined;
  let settingsAskedAt = 0;

  function write(name: AcaiaCommand): Command {
    return {
      type: "write",
      svc: variant.svc,
      chr: variant.writeChr,
      bytes: commands[name](),
      mode: variant.writeMode,
    };
  }

  function step(events: ScaleEvent[], cmds: Command[] = []): Step {
    return { events, commands: cmds, wakeAt };
  }

  /** Asks for the settings, unless an answer to the last ask is still due. */
  function askForSettings(t: number): Command[] {
    if (t - settingsAskedAt < SETTINGS_REPLY_TIMEOUT_MS) return [];
    settingsAskedAt = t;
    return [write("getSettings")];
  }

  /** No reading leaves without a unit the settings confirmed (ADR 0019). */
  function weightOutput({ value, decimals, isStable }: Weight, t: number): Output {
    if (unit === undefined || decimals !== UNIT_DECIMALS[unit]) {
      unit = undefined;
      return { events: [], commands: askForSettings(t) };
    }
    const flowPerSec = flow.push(t, value, unit);
    return only({
      type: "reading",
      reading: { t, value, unit, decimals, stable: isStable, flowPerSec },
    });
  }

  function recordOutput(records: AcaiaRecord[], i: number, t: number): Output {
    const record = records[i];
    switch (record?.kind) {
      case "weight":
        return weightOutput(record, t);
      case "timer": {
        const event = timer.push(record.ms, isAheadOfWeight(records, i));
        return event ? only(event) : NOTHING;
      }
      case "battery":
        return only({ type: "battery", percent: record.percent });
      case "button":
        if (record.button === "tare") flow.reset();
        return only({ type: "button", button: record.button });
      default:
        return NOTHING;
    }
  }

  function messageOutput(message: AcaiaMessage | undefined, t: number): Output {
    switch (message?.type) {
      case "event":
        return merge(message.records.map((_, i) => recordOutput(message.records, i, t)));
      case "settings":
        unit = message.settings.unit;
        return only({ type: "battery", percent: message.settings.batteryPercent });
      case "info":
        if (hasReportedInfo) return NOTHING;
        hasReportedInfo = true;
        return only({ type: "info", ...message.info });
      default:
        return NOTHING;
    }
  }

  function identify(t: number): Command[] {
    phase = "handshaking";
    wakeAt = t + variant.heartbeatMs;
    return [write("identify"), write("notificationRequest")];
  }

  /** The scale sends this frame until identified: identify at once, or again. */
  function notIdentifiedCommands(t: number): Command[] {
    return phase === "waitingForInfo" ? identify(t) : [write("identify")];
  }

  function frameOutput(frame: Frame, t: number): Output {
    const output = messageOutput(decodeMessage(frame), t);
    if (frame.type !== NOT_IDENTIFIED_TYPE) return output;
    return { ...output, commands: [...notIdentifiedCommands(t), ...output.commands] };
  }

  function receiveFrames(frames: Frame[], t: number): Step {
    const { events, commands: cmds } = merge(frames.map((frame) => frameOutput(frame, t)));
    // The scale describing itself isn't data yet; anything else after identifying is.
    if (phase === "handshaking" && events.some((e) => e.type !== "info")) {
      phase = "ready";
      events.unshift({ type: "state", state: "ready" });
    }
    return step(events, cmds);
  }

  function silenceEvents(t: number): ScaleEvent[] {
    if (isSilent || t - lastFrameAt < SILENCE_TIMEOUT_MS) return [];
    isSilent = true;
    const error = new OpenPourError("timeout", `no data from the scale for ${t - lastFrameAt} ms`);
    return [{ type: "error", error }];
  }

  // Scales may drop the notification request, so it rides along with every heartbeat.
  function heartbeat(t: number): Step {
    wakeAt = t + variant.heartbeatMs;
    const cmds = [write("heartbeat"), write("notificationRequest")];
    if (phase === "handshaking") cmds.unshift(write("identify"));
    return step(silenceEvents(t), cmds);
  }

  function send(name: AcaiaCommand): Step {
    return step([], [write(name)]);
  }

  return {
    info: { brand: "Acaia", model: "unknown" },
    capabilities: CAPABILITIES,
    start(t) {
      lastFrameAt = t;
      settingsAskedAt = t;
      wakeAt = t + INFO_WAIT_MS;
      const subscribe: Command = { type: "subscribe", svc: variant.svc, chr: variant.notifyChr };
      return step([{ type: "state", state: "handshaking" }], [subscribe]);
    },
    receive(chr, bytes, t) {
      if (normalizeUuid(chr) !== notifyChr) return step([]);
      const frames = reader.push(bytes);
      if (frames.length > 0) {
        lastFrameAt = t;
        isSilent = false;
      }
      return receiveFrames(frames, t);
    },
    tick(t) {
      if (t < wakeAt) return step([]);
      return phase === "waitingForInfo" ? step([], identify(t)) : heartbeat(t);
    },
    tare() {
      flow.reset();
      return send("tare");
    },
    timer: {
      start: () => send("timerStart"),
      stop: () => send("timerStop"),
      reset: () => send("timerReset"),
    },
    requestBattery: () => send("getSettings"),
  };
}
