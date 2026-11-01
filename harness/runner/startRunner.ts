import type { Command, ScaleEvent, ScaleSession, Step } from "openpour";
import type { BluetoothSource } from "./BluetoothSource.js";
import type { Clock } from "./Clock.js";

/** One packet as it crossed the radio, never split or merged. */
export interface Packet {
  t: number;
  dir: "tx" | "rx";
  svc: string;
  chr: string;
  bytes: Uint8Array;
}

export type RunnerEvent =
  /** The time the runner called `session.start`, reported before anything else. */
  | { type: "started"; t: number }
  | { type: "scale"; t: number; event: ScaleEvent }
  | { type: "packet"; packet: Packet }
  | { type: "commandFailed"; t: number; command: Command; error: unknown }
  | { type: "sessionThrew"; t: number; error: unknown }
  | { type: "disconnected"; t: number };

export interface RunnerOptions {
  source: BluetoothSource;
  session: ScaleSession;
  clock: Clock;
  /** Gets every event. If it throws, the runner carries on and rethrows the error from a timer. */
  onEvent: (event: RunnerEvent) => void;
}

/** Controls for one connected scale. After a disconnect every control does nothing. */
export interface Runner {
  tare(): void;
  timer: { start(): void; stop(): void; reset(): void };
  requestBattery(): void;
  /** Stops the runner, then closes the connection. Reconnecting needs a new session and runner. */
  disconnect(): Promise<void>;
}

type Characteristic = { svc: string; chr: string };

/**
 * Starts `session` and runs its command loop on `source`: commands run one at a time in order, so a
 * subscription completes before any later write; received bytes reach the session unchanged with
 * their arrival time; and each step replaces the pending wake-up. Once disconnected, queued work is
 * dropped and late callbacks from the connection are ignored.
 */
export function startRunner({ source, session, clock, onEvent }: RunnerOptions): Runner {
  let isClosed = false;
  let cancelWake: (() => void) | undefined;
  let queue: Promise<void> = Promise.resolve();

  function call(run: (t: number) => Step, t = clock.now()): void {
    if (isClosed) return;
    let step: Step;
    try {
      step = run(t);
    } catch (error) {
      emit({ type: "sessionThrew", t, error });
      return;
    }
    apply(step, t);
  }

  // Commands are queued before events go out, so a listener reacting to an event can't jump the queue.
  // The queue never rejects: execute() reports every failure itself.
  function apply(step: Step, t: number): void {
    for (const command of step.commands) queue = queue.then(() => execute(command));
    replaceWake(step.wakeAt);
    for (const event of step.events) emit({ type: "scale", t, event });
  }

  // On every path, a listener that throws must not change what the runner does: commands and
  // wake-ups already scheduled still need this runner to stop them. Nor may the error vanish: it is
  // reported the way an error thrown from a timer is.
  function emit(event: RunnerEvent): void {
    try {
      onEvent(event);
    } catch (error) {
      clock.schedule(() => {
        throw error;
      }, 0);
    }
  }

  function replaceWake(wakeAt: number | undefined): void {
    cancelWake?.();
    cancelWake = undefined;
    if (wakeAt === undefined) return;
    const fire = (): void => {
      cancelWake = undefined;
      call((t) => session.tick(t));
    };
    cancelWake = clock.schedule(fire, Math.max(0, wakeAt - clock.now()));
  }

  async function execute(command: Command): Promise<void> {
    if (isClosed) return;
    try {
      await perform(command);
    } catch (error) {
      if (!isClosed) emit({ type: "commandFailed", t: clock.now(), command, error });
    }
  }

  async function perform(command: Command): Promise<void> {
    switch (command.type) {
      case "subscribe":
        return source.subscribe(command.svc, command.chr, (bytes, t) => receive(command, bytes, t));
      case "write":
        packet("tx", command, command.bytes, clock.now());
        return source.write(command.svc, command.chr, command.bytes, command.mode);
      case "read": {
        const bytes = await source.read(command.svc, command.chr);
        return receive(command, bytes, clock.now());
      }
    }
  }

  function receive(from: Characteristic, bytes: Uint8Array, t: number): void {
    if (isClosed) return;
    packet("rx", from, bytes, t);
    call((at) => session.receive(from.chr, bytes, at), t);
  }

  function packet(dir: Packet["dir"], { svc, chr }: Characteristic, bytes: Uint8Array, t: number) {
    emit({ type: "packet", packet: { t, dir, svc, chr, bytes } });
  }

  function close(): void {
    if (isClosed) return;
    isClosed = true;
    cancelWake?.();
    cancelWake = undefined;
    emit({ type: "disconnected", t: clock.now() });
  }

  source.onDisconnect(close);
  const startT = clock.now();
  emit({ type: "started", t: startT });
  call((t) => session.start(t), startT);

  return {
    tare: () => call((t) => session.tare(t)),
    timer: {
      start: () => call((t) => session.timer.start(t)),
      stop: () => call((t) => session.timer.stop(t)),
      reset: () => call((t) => session.timer.reset(t)),
    },
    requestBattery: () => call((t) => session.requestBattery(t)),
    async disconnect() {
      close();
      await source.disconnect();
    },
  };
}
