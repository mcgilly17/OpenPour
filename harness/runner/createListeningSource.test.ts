import { acaia, INFO_WAIT_MS } from "openpour/acaia";
import { bytesToHex, hexToBytes } from "openpour/replay";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ACAIA_VECTORS as RX, ACAIA_COMMAND_VECTORS as TX } from "../../src/test/acaiaVectors.js";
import { ACAIA_GATT, ACAIA_NOTIFY, ACAIA_SVC } from "../test/acaiaGatt.js";
import { advanceTo, useFakeClock } from "../test/useFakeClock.js";
import { createFakeSource, type FakeCall, type FakeOutcome } from "./createFakeSource.js";
import { createListeningSource } from "./createListeningSource.js";
import { type RunnerEvent, startRunner } from "./startRunner.js";
import { subscriptionsOnStart } from "./subscriptionsOnStart.js";

/** The unsolicited type 7 frame a Pearl S can send right after subscribing (docs/design.md). */
const TYPE_7 = "efdd0707035c01000801640c";
const FAILURE = new Error("GATT operation failed");

afterEach(() => {
  vi.useRealTimers();
});

function listening(outcomeOf?: (call: FakeCall) => FakeOutcome) {
  const clock = useFakeClock();
  const fake = createFakeSource(clock, outcomeOf);
  const source = createListeningSource(fake, clock);
  const heard: [string, number][] = [];
  const listener = (bytes: Uint8Array, t: number) => heard.push([bytesToHex(bytes), t]);
  const taken: [string, number][] = [];
  const takeover = (bytes: Uint8Array, t: number) => taken.push([bytesToHex(bytes), t]);
  const notify = (hex: string, t?: number) =>
    fake.notify(ACAIA_SVC, ACAIA_NOTIFY, hexToBytes(hex), t);
  return { clock, fake, source, heard, listener, taken, takeover, notify };
}

describe("createListeningSource", () => {
  test("a later subscribe takes a listened characteristic over without subscribing again", async () => {
    const { clock, fake, source, heard, listener, taken, takeover, notify } = listening();
    await source.listen(ACAIA_SVC, ACAIA_NOTIFY, listener);
    notify("01");

    await advanceTo(clock, 50);
    await source.subscribe(ACAIA_SVC, ACAIA_NOTIFY, takeover);
    notify("02");

    expect(fake.calls).toEqual([{ type: "subscribe", svc: ACAIA_SVC, chr: ACAIA_NOTIFY }]);
    expect(heard).toEqual([["01", 0]]);
    expect(taken).toEqual([["02", 50]]);
  });

  test("a takeover waits for a listen still in flight, so later writes follow the subscription", async () => {
    const { clock, fake, source, listener, takeover } = listening(() => ({ delayMs: 300 }));
    void source.listen(ACAIA_SVC, ACAIA_NOTIFY, listener);
    let isTakenOver = false;

    void source.subscribe(ACAIA_SVC, ACAIA_NOTIFY, takeover).then(() => {
      isTakenOver = true;
    });
    await advanceTo(clock, 299);
    expect(isTakenOver).toBe(false);
    await advanceTo(clock, 300);

    expect(isTakenOver).toBe(true);
    expect(fake.calls).toHaveLength(1);
  });

  test("a failed listen leaves the characteristic to a real subscription", async () => {
    let isFirst = true;
    const { fake, source, listener, taken, takeover, notify } = listening(() => {
      const outcome = isFirst ? { error: FAILURE } : {};
      isFirst = false;
      return outcome;
    });

    await expect(source.listen(ACAIA_SVC, ACAIA_NOTIFY, listener)).rejects.toBe(FAILURE);
    await source.subscribe(ACAIA_SVC, ACAIA_NOTIFY, takeover);
    notify("03");

    expect(fake.calls).toHaveLength(2);
    expect(taken).toEqual([["03", 0]]);
  });

  test("a notification stamped before the takeover stays with the listener", async () => {
    const { clock, source, heard, listener, taken, takeover, notify } = listening();
    await source.listen(ACAIA_SVC, ACAIA_NOTIFY, listener);
    await advanceTo(clock, 100);
    await source.subscribe(ACAIA_SVC, ACAIA_NOTIFY, takeover);

    // Arrived just before the takeover, delivered just after it.
    notify("04", 99.5);
    notify("05", 100);

    expect(heard).toEqual([["04", 99.5]]);
    expect(taken).toEqual([["05", 100]]);
  });
});

describe("listening, then starting an Acaia session", () => {
  test("captures an unsolicited frame with no writes, then starts cleanly with no duplicate rx", async () => {
    const { clock, fake, source, heard, listener, notify } = listening();
    for (const { svc, chr } of subscriptionsOnStart(acaia.createSession(ACAIA_GATT), 0)) {
      await source.listen(svc, chr, listener);
    }
    await advanceTo(clock, 20);
    notify(TYPE_7);
    await advanceTo(clock, 3000);
    expect(fake.calls).toEqual([{ type: "subscribe", svc: ACAIA_SVC, chr: ACAIA_NOTIFY }]);

    const events: RunnerEvent[] = [];
    startRunner({
      source,
      session: acaia.createSession(ACAIA_GATT),
      clock,
      onEvent: (event) => events.push(event),
    });
    await advanceTo(clock, 3000 + INFO_WAIT_MS);
    notify(RX.weight);

    const sent = fake.calls.map((call) =>
      call.type === "write" ? bytesToHex(call.bytes) : call.type,
    );
    expect(sent).toEqual(["subscribe", TX.identify, TX.notificationRequest]);
    expect(heard).toEqual([[TYPE_7, 20]]);
    const received = events.flatMap((e) =>
      e.type === "packet" && e.packet.dir === "rx" ? [bytesToHex(e.packet.bytes)] : [],
    );
    expect(received).toEqual([RX.weight]);
  });
});
