import type { Command, ScaleSession, Step } from "openpour";
import { acaia, SUBSCRIBE_SETTLE_MS } from "openpour/acaia";
import { bytesToHex, hexToBytes, parseFixture } from "openpour/replay";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ACAIA_VECTORS as RX, ACAIA_COMMAND_VECTORS as TX } from "../../src/test/acaiaVectors.js";
import { ACAIA_GATT, ACAIA_NOTIFY, ACAIA_SVC } from "../test/acaiaGatt.js";
import { advanceTo, useFakeClock } from "../test/useFakeClock.js";
import type { Clock } from "./Clock.js";
import {
  createFakeSource,
  type FakeCall,
  type FakeOutcome,
  type FakeSource,
} from "./createFakeSource.js";
import { createRecorder } from "./createRecorder.js";
import { type RunnerEvent, startRunner } from "./startRunner.js";

const SVC = "Svc-0x1820";
const NOTIFY = "Chr-Notify";
const SUBSCRIBE: Command = { type: "subscribe", svc: SVC, chr: NOTIFY };
const WRITE: Command = {
  type: "write",
  svc: SVC,
  chr: "Chr-Write",
  bytes: Uint8Array.of(0xef, 0xdd),
  mode: "noResponse",
};
const WRITE_WITH_RESPONSE: Command = { ...WRITE, bytes: Uint8Array.of(0x01), mode: "response" };
const READ: Command = { type: "read", svc: SVC, chr: "Chr-Read" };
const FAILURE = new Error("GATT operation failed");

afterEach(() => {
  vi.useRealTimers();
});

function step(commands: Command[] = [], wakeAt?: number): Step {
  return { events: [], commands, ...(wakeAt === undefined ? {} : { wakeAt }) };
}

/** Starts with `first`, answers everything else with an empty step, and spies on every call. */
function stubSession(first: Step) {
  const idle = (_t: number): Step => step();
  return {
    info: { brand: "Test", model: "Stub" },
    capabilities: { tare: true, timer: true, battery: true, resolutionGrams: 0.1, maxRateHz: 10 },
    start: vi.fn((_t: number) => first),
    receive: vi.fn((_chr: string, _bytes: Uint8Array, _t: number) => step()),
    tick: vi.fn((_t: number) => step()),
    tare: vi.fn((_t: number) => step()),
    timer: { start: vi.fn(idle), stop: vi.fn(idle), reset: vi.fn(idle) },
    requestBattery: vi.fn(idle),
  } satisfies ScaleSession;
}

function run(session: ScaleSession, outcomeOf?: (call: FakeCall) => FakeOutcome) {
  const clock = useFakeClock();
  const source = createFakeSource(clock, outcomeOf);
  const events: RunnerEvent[] = [];
  const runner = startRunner({ source, session, clock, onEvent: (event) => events.push(event) });
  return { clock, source, events, runner };
}

function sent(source: FakeSource): string[] {
  return source.calls.map((call) => (call.type === "write" ? bytesToHex(call.bytes) : call.type));
}

describe("startRunner commands", () => {
  test("runs each step's commands in order, with UUIDs and write modes unchanged", async () => {
    const commands = [SUBSCRIBE, WRITE, WRITE_WITH_RESPONSE, READ];
    const { source } = run(stubSession(step(commands)));

    await vi.advanceTimersByTimeAsync(0);

    expect(source.calls).toEqual(commands);
  });

  test("completes a subscription before any later write", async () => {
    const { clock, source } = run(stubSession(step([SUBSCRIBE, WRITE])), (call) =>
      call.type === "subscribe" ? { delayMs: 300 } : {},
    );

    await advanceTo(clock, 299);
    expect(source.calls).toEqual([SUBSCRIBE]);
    await advanceTo(clock, 300);
    expect(source.calls).toEqual([SUBSCRIBE, WRITE]);
  });

  test("holds the Acaia handshake until a slow subscription completes", async () => {
    const subscribeMs = SUBSCRIBE_SETTLE_MS * 5;
    const { clock, source } = run(acaia.createSession(ACAIA_GATT), (call) =>
      call.type === "subscribe" ? { delayMs: subscribeMs } : {},
    );

    await advanceTo(clock, subscribeMs - 1);
    expect(sent(source)).toEqual(["subscribe"]);
    await advanceTo(clock, subscribeMs);
    expect(sent(source)).toEqual(["subscribe", TX.identify, TX.notificationRequest]);
  });

  test("runs tare, timer and battery requests at the current time", async () => {
    const session = stubSession(step());
    session.tare.mockReturnValueOnce(step([WRITE]));
    const { clock, source, runner } = run(session);
    await advanceTo(clock, 700);

    runner.tare();
    runner.timer.start();
    runner.timer.stop();
    runner.timer.reset();
    runner.requestBattery();
    await vi.advanceTimersByTimeAsync(0);

    const { tare, timer, requestBattery } = session;
    for (const action of [tare, timer.start, timer.stop, timer.reset, requestBattery]) {
      expect(action).toHaveBeenCalledExactlyOnceWith(700);
    }
    expect(source.calls).toEqual([WRITE]);
  });
});

describe("startRunner input and output", () => {
  test("feeds notification bytes to the session unchanged, with their arrival time", async () => {
    const session = stubSession(step([SUBSCRIBE]));
    const { clock, source, events } = run(session);
    await advanceTo(clock, 2000);
    const bytes = Uint8Array.of(0xef, 0xdd, 0x0c);

    source.notify(SVC, NOTIFY, bytes, 1234.5);

    expect(session.receive).toHaveBeenCalledExactlyOnceWith(NOTIFY, bytes, 1234.5);
    expect(session.receive.mock.calls[0]?.[1]).toBe(bytes);
    const packet = { t: 1234.5, dir: "rx", svc: SVC, chr: NOTIFY, bytes };
    expect(events).toContainEqual({ type: "packet", packet });
  });

  test("feeds a read result to the session at the time it arrives", async () => {
    const bytes = Uint8Array.of(93);
    const session = stubSession(step([READ]));
    const { clock } = run(session, () => ({ delayMs: 50, bytes }));

    await advanceTo(clock, 50);

    expect(session.receive).toHaveBeenCalledExactlyOnceWith(READ.chr, bytes, 50);
  });

  test("lets each step replace the pending wake-up, and a step without one cancel it", async () => {
    const session = stubSession(step([SUBSCRIBE], 1000));
    session.receive.mockReturnValueOnce(step([], 500)).mockReturnValueOnce(step());
    session.tick.mockReturnValueOnce(step([], 900));
    const { clock, source } = run(session);

    await advanceTo(clock, 200);
    source.notify(SVC, NOTIFY, Uint8Array.of(1));
    await advanceTo(clock, 700);
    source.notify(SVC, NOTIFY, Uint8Array.of(2));
    await advanceTo(clock, 5000);

    expect(session.tick.mock.calls).toEqual([[500]]);
  });

  test("reports session events, and a throwing session without stopping", async () => {
    const handshaking = { type: "state", state: "handshaking" } as const;
    const session = stubSession({ events: [handshaking], commands: [SUBSCRIBE] });
    session.tare.mockImplementationOnce(() => {
      throw FAILURE;
    });
    const { clock, source, events, runner } = run(session);
    await advanceTo(clock, 100);

    runner.tare();
    source.notify(SVC, NOTIFY, Uint8Array.of(1));

    expect(events).toEqual([
      { type: "scale", t: 0, event: handshaking },
      { type: "sessionThrew", t: 100, error: FAILURE },
      {
        type: "packet",
        packet: { t: 100, dir: "rx", svc: SVC, chr: NOTIFY, bytes: Uint8Array.of(1) },
      },
    ]);
    expect(session.receive).toHaveBeenCalledOnce();
  });
});

describe("startRunner failures", () => {
  test.each([SUBSCRIBE, WRITE, READ])(
    "reports a $type rejected after a delay, then runs the next command",
    async (failing) => {
      let isFirst = true;
      const failFirst = (): FakeOutcome => {
        const outcome = isFirst ? { delayMs: 100, error: FAILURE } : {};
        isFirst = false;
        return outcome;
      };
      const session = stubSession(step([failing, WRITE_WITH_RESPONSE]));
      const { clock, source, events } = run(session, failFirst);

      await advanceTo(clock, 99);
      expect(source.calls).toEqual([failing]);
      await advanceTo(clock, 100);
      expect(source.calls).toEqual([failing, WRITE_WITH_RESPONSE]);
      expect(events).toContainEqual({
        type: "commandFailed",
        t: 100,
        command: failing,
        error: FAILURE,
      });

      source.notify(SVC, NOTIFY, Uint8Array.of(1));
      expect(session.receive).not.toHaveBeenCalled();
    },
  );

  test("keeps running commands when a listener throws on a failure, and still surfaces its error", async () => {
    const listenerBug = new Error("listener bug");
    const clock = useFakeClock();
    const source = createFakeSource(clock, (call) =>
      call.type === "write" ? {} : { error: FAILURE },
    );
    startRunner({
      source,
      session: stubSession(step([READ, WRITE, WRITE_WITH_RESPONSE])),
      clock,
      onEvent(event) {
        if (event.type === "commandFailed") throw listenerBug;
      },
    });

    await expect(vi.advanceTimersByTimeAsync(0)).rejects.toBe(listenerBug);

    expect(source.calls).toEqual([READ, WRITE, WRITE_WITH_RESPONSE]);
  });
});

describe("startRunner disconnect", () => {
  test("a dropped connection cancels the wake-up and queued commands, reported once", async () => {
    const session = stubSession(step([SUBSCRIBE, WRITE, WRITE_WITH_RESPONSE], 1000));
    const { clock, source, events } = run(session, (call) =>
      call.type === "subscribe" ? { delayMs: 100 } : {},
    );

    await advanceTo(clock, 50);
    source.drop();
    source.drop();
    await advanceTo(clock, 5000);

    expect(session.tick).not.toHaveBeenCalled();
    expect(source.calls).toEqual([SUBSCRIBE]);
    expect(events.filter(({ type }) => type === "disconnected")).toEqual([
      { type: "disconnected", t: 50 },
    ]);
  });

  test.each<[string, Command, FakeOutcome]>([
    ["a read result", READ, { delayMs: 100, bytes: Uint8Array.of(1) }],
    ["a write failure", WRITE, { delayMs: 100, error: FAILURE }],
  ])("ignores %s and notifications from the old connection", async (_, inFlight, outcome) => {
    const session = stubSession(step([SUBSCRIBE, inFlight], 1000));
    const { clock, source, events } = run(session, (call) =>
      call.type === inFlight.type ? outcome : {},
    );
    await advanceTo(clock, 50);
    source.drop();
    const seen = events.length;

    source.notify(SVC, NOTIFY, Uint8Array.of(2));
    await advanceTo(clock, 2000);

    expect(session.receive).not.toHaveBeenCalled();
    expect(session.tick).not.toHaveBeenCalled();
    expect(events).toHaveLength(seen);
  });

  test("disconnect() closes the connection and turns every control off", async () => {
    const session = stubSession(step([SUBSCRIBE], 1000));
    const { clock, source, events, runner } = run(session);
    await advanceTo(clock, 10);

    await runner.disconnect();
    runner.tare();
    runner.requestBattery();
    await advanceTo(clock, 2000);

    expect(source.calls).toEqual([SUBSCRIBE, { type: "disconnect" }]);
    expect(session.tare).not.toHaveBeenCalled();
    expect(session.requestBattery).not.toHaveBeenCalled();
    expect(session.tick).not.toHaveBeenCalled();
    expect(events.filter(({ type }) => type === "disconnected")).toEqual([
      { type: "disconnected", t: 10 },
    ]);
  });
});

describe("two runners side by side", () => {
  function connect(clock: Clock, label: string) {
    const source = createFakeSource(clock);
    const recorder = createRecorder({ startT: 0, label });
    const events: RunnerEvent[] = [];
    const runner = startRunner({
      source,
      session: acaia.createSession(ACAIA_GATT),
      clock,
      onEvent(event) {
        events.push(event);
        if (event.type === "packet") recorder.add(event.packet);
      },
    });
    const grams = () =>
      events.flatMap((e) =>
        e.type === "scale" && e.event.type === "reading" ? [e.event.reading.grams] : [],
      );
    const notify = (hex: string) => source.notify(ACAIA_SVC, ACAIA_NOTIFY, hexToBytes(hex));
    return { source, recorder, events, runner, grams, notify };
  }

  function receivedHex(jsonl: string): string[] {
    return parseFixture(jsonl).records.flatMap((r) => (r.dir === "rx" ? [r.hex] : []));
  }

  test("keep commands, readings and recordings apart, and one dropping leaves the other running", async () => {
    const clock = useFakeClock();
    const a = connect(clock, "a");
    const b = connect(clock, "b");
    await advanceTo(clock, 200);

    a.runner.tare();
    a.notify(RX.weight);
    b.notify(RX.ackWithNegativeWeight);
    await advanceTo(clock, 500);
    a.source.drop();
    await advanceTo(clock, 2500);
    b.notify(RX.weight);

    const handshake = ["subscribe", TX.identify, TX.notificationRequest];
    const heartbeat = [TX.heartbeat, TX.notificationRequest];
    expect(sent(a.source)).toEqual([...handshake, TX.tare]);
    expect(sent(b.source)).toEqual([...handshake, ...heartbeat, ...heartbeat]);
    expect(a.grams()).toEqual([175.9]);
    expect(b.grams()).toEqual([-598, 175.9]);
    expect(a.events.at(-1)).toEqual({ type: "disconnected", t: 500 });
    expect(b.events.some(({ type }) => type === "disconnected")).toBe(false);

    const details = {
      brand: "Acaia",
      model: "Lunar",
      firmware: "unknown",
      captured: "2026-11-01",
      tool: "fake source",
      scenario: "two-scales",
    };
    const fileA = a.recorder.export(details);
    const fileB = b.recorder.export(details);
    expect([fileA.fileName, fileB.fileName]).toEqual([
      "Lunar_fwunknown_two-scales-a.jsonl",
      "Lunar_fwunknown_two-scales-b.jsonl",
    ]);
    expect(receivedHex(fileA.jsonl)).toEqual([RX.weight]);
    expect(receivedHex(fileB.jsonl)).toEqual([RX.ackWithNegativeWeight, RX.weight]);
  });
});
