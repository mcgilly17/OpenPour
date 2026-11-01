import { OpenPourError } from "../../core/errors.js";
import { createFlowFilter } from "../../core/flow.js";
import type { Capabilities, Command, ScaleEvent, ScaleSession, Step } from "../../core/types.js";
import { type AcaiaCommand, commands } from "./commands.js";
import { createFrameReader, type Frame } from "./createFrameReader.js";
import { type AcaiaRecord, decodeMessage } from "./decodeMessage.js";
import { type AcaiaVariant, normalizeUuid } from "./findVariant.js";

/** A short pause after subscribing before identifying, which scales are commonly given. */
export const SUBSCRIBE_SETTLE_MS = 100;
/** No frame for this long means the scale stopped talking; reported once as a timeout error. */
export const SILENCE_TIMEOUT_MS = 5000;

const NOT_IDENTIFIED_TYPE = 7;

const CAPABILITIES: Capabilities = {
  tare: true,
  timer: true,
  battery: true,
  resolutionGrams: 0.1,
  maxRateHz: 10,
};

type Phase = "subscribing" | "handshaking" | "ready";

/** One connected Acaia scale. The variant comes from the GATT layout (see `findVariant`). */
export function createAcaiaSession(variant: AcaiaVariant): ScaleSession {
  const reader = createFrameReader();
  const flow = createFlowFilter();
  const notifyChr = normalizeUuid(variant.notifyChr);
  let phase: Phase = "subscribing";
  let wakeAt = 0;
  let lastFrameAt = 0;
  let isSilent = false;
  let isTimerRunning = false;

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

  function recordEvents(record: AcaiaRecord, t: number): ScaleEvent[] {
    switch (record.kind) {
      case "weight": {
        const flowGramsPerSec = flow.push(t, record.grams);
        // ponytail: stable is inferred from zero flow until a capture shows the scale's settled bit.
        const reading = { t, grams: record.grams, stable: flowGramsPerSec === 0, flowGramsPerSec };
        return [{ type: "reading", reading }];
      }
      case "timer":
        return [{ type: "timer", running: isTimerRunning, ms: record.ms }];
      case "battery":
        return [{ type: "battery", percent: record.percent }];
      case "button":
        if (record.button === "tare") flow.reset();
        if (record.button === "start") isTimerRunning = true;
        if (record.button === "stop" || record.button === "reset") isTimerRunning = false;
        return [{ type: "button", button: record.button }];
    }
  }

  function frameEvents(frame: Frame, t: number): ScaleEvent[] {
    const message = decodeMessage(frame);
    if (!message) return [];
    if (message.type === "event") return message.records.flatMap((r) => recordEvents(r, t));
    isTimerRunning = message.settings.isTimerRunning;
    return [{ type: "battery", percent: message.settings.batteryPercent }];
  }

  function receiveFrames(frames: Frame[], t: number): Step {
    const events: ScaleEvent[] = [];
    const cmds: Command[] = [];
    for (const frame of frames) {
      if (frame.type === NOT_IDENTIFIED_TYPE) cmds.push(write("identify"));
      events.push(...frameEvents(frame, t));
    }
    if (events.length > 0 && phase === "handshaking") {
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

  function identify(t: number): Step {
    phase = "handshaking";
    wakeAt = t + variant.heartbeatMs;
    return step([], [write("identify"), write("notificationRequest")]);
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
      wakeAt = t + SUBSCRIBE_SETTLE_MS;
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
      return phase === "subscribing" ? identify(t) : heartbeat(t);
    },
    tare() {
      flow.reset();
      return send("tare");
    },
    timer: {
      start() {
        isTimerRunning = true;
        return send("timerStart");
      },
      stop() {
        isTimerRunning = false;
        return send("timerStop");
      },
      reset() {
        isTimerRunning = false;
        return send("timerReset");
      },
    },
    requestBattery: () => send("getSettings"),
  };
}
