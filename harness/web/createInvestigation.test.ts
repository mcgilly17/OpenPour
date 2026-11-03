import type { FixtureRecord } from "openpour/replay";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createInvestigation,
  type InvestigateAction,
  type InvestigatedScale,
  type InvestigationState,
  NOT_FOUND,
  WIZARD_SETTLE_MS,
} from "./createInvestigation.js";
import { downloadText } from "./downloadText.js";

vi.mock("./downloadText.js");

afterEach(() => {
  vi.clearAllMocks();
});

/** A settings frame with sound at byte 9. */
const settings = (sound: string): string => `efdd08095d02020100${sound}01000d60`;

/** What the scale answers on a connection: a frame split in two, or nothing at all. */
type Answer = { sound: string } | "not found" | "silent";

function rx(hex: string): FixtureRecord {
  return { t: 0, dir: "rx", svc: "svc", chr: "notify", hex };
}

/** A scale that answers each connection with the next of `answers`, logging what it was asked. */
function stubScale(answers: Answer[]) {
  const calls: string[] = [];
  let records: FixtureRecord[] = [];
  let exported = 0;
  const scale: InvestigatedScale = {
    name: "Acaia PEARL",
    async disconnect() {
      calls.push("disconnect");
    },
    async connectReady() {
      calls.push("connect");
      const answer = answers.shift() ?? "not found";
      if (answer === "not found") return false;
      const frame = answer === "silent" ? "" : settings(answer.sound);
      records = frame === "" ? [] : [rx(frame.slice(0, 4)), rx(frame.slice(4))];
      return true;
    },
    send: (command) => calls.push(`send ${command}`),
    async wait(delayMs) {
      calls.push(`wait ${delayMs}`);
    },
    latestRecords: () => records,
    exportLatest(form) {
      calls.push(`export ${form.get("scenario")}-${form.get("scenarioDetail")}`);
      return `fixture-${++exported}.jsonl`;
    },
  };
  return { scale, calls };
}

function investigate(scale: InvestigatedScale) {
  const show = vi.fn<(state: InvestigationState) => void>();
  const act = createInvestigation(scale, show);
  const shownState = (): InvestigationState | undefined => show.mock.calls.at(-1)?.[0];
  return { act, shownState };
}

const START: InvestigateAction = {
  type: "start",
  setting: "Sound",
  options: "on, off",
  command: "battery",
};
const READ = (): InvestigateAction => ({ type: "read", answers: new FormData() });

describe("createInvestigation", () => {
  test("steps through each option, then the first again, reading the scale after each", async () => {
    const { scale, calls } = stubScale([{ sound: "01" }, { sound: "00" }, { sound: "01" }]);
    const { act, shownState } = investigate(scale);

    await act({ type: "open" });
    await act(START);
    const first = shownState()?.screen;
    for (let step = 0; step < 3; step++) await act(READ());

    expect(first).toMatchObject({
      stage: "step",
      status: "waiting",
      run: { plan: ["on", "off", "on"] },
    });
    const oneStep = (detail: string) => [
      "disconnect",
      "connect",
      "send battery",
      `wait ${WIZARD_SETTLE_MS}`,
      `export settings-change-${detail}`,
      "disconnect",
    ];
    expect(calls).toEqual([
      "disconnect",
      ...oneStep("sound-on"),
      ...oneStep("sound-off"),
      ...oneStep("sound-on-again"),
    ]);
    const { screen, results } = shownState() ?? {};
    expect(screen).toMatchObject({ stage: "result", result: { setting: "Sound" } });
    expect(results?.[0]?.steps.map(({ option, fixtureFile }) => [option, fixtureFile])).toEqual([
      ["on", "fixture-1.jsonl"],
      ["off", "fixture-2.jsonl"],
      ["on", "fixture-3.jsonl"],
    ]);
    expect(results?.[0]?.findings).toMatchObject([{ kind: "efdd08", index: 9, follows: true }]);
  });

  test("asks nothing when the investigation asks the scale with nothing", async () => {
    const { scale, calls } = stubScale([{ sound: "01" }]);
    const { act } = investigate(scale);

    await act({ ...START, command: undefined });
    await act(READ());

    expect(calls.some((call) => call.startsWith("send"))).toBe(false);
  });

  test.each([
    ["on", "List at least two options, separated by commas."],
    ["on, on", "List each option once."],
    ["on, D9F8BC", 'option "D9F8BC" contains D9F8BC'],
  ])("Start refuses the options %j, says why and stays on the form", async (options, problem) => {
    const { scale, calls } = stubScale([]);
    const { act, shownState } = investigate(scale);
    await act({ type: "open" });

    await act({ ...START, options });

    expect(shownState()?.screen).toEqual({ stage: "form" });
    expect(shownState()?.problem).toContain(problem);
    expect(calls).toEqual([]);
  });

  test.each<[string, Answer]>([
    ["isn't found", "not found"],
    ["sends no frame", "silent"],
  ])("a step whose scale %s fails, and Retry reads the same step again", async (_, answer) => {
    const { scale, calls } = stubScale([answer, { sound: "01" }]);
    const { act, shownState } = investigate(scale);
    await act(START);

    await act(READ());
    const failed = shownState();
    await act(READ());

    expect(failed).toMatchObject({
      screen: { stage: "step", status: "failed" },
      problem: NOT_FOUND,
    });
    expect(calls.filter((call) => call.startsWith("export"))).toEqual([
      "export settings-change-sound-on",
    ]);
    expect(calls.at(-1)).toBe("disconnect");
    expect(shownState()).toMatchObject({
      screen: { stage: "step", status: "waiting", run: { captures: [{ option: "on" }] } },
      problem: undefined,
    });
  });

  test("a refused export says why and leaves the step to retry", async () => {
    const { scale } = stubScale([{ sound: "01" }]);
    scale.exportLatest = () => {
      throw new Error('model "D9F8BC" looks like a device identifier');
    };
    const { act, shownState } = investigate(scale);
    await act(START);

    await act(READ());

    expect(shownState()).toMatchObject({
      screen: { stage: "step", status: "failed" },
      problem: 'Not captured: model "D9F8BC" looks like a device identifier',
    });
  });

  test("Cancel drops the setting in progress and keeps finished ones", async () => {
    const { scale } = stubScale([{ sound: "01" }, { sound: "00" }, { sound: "01" }, "not found"]);
    const { act, shownState } = investigate(scale);
    await act(START);
    for (let step = 0; step < 3; step++) await act(READ());
    await act({ type: "open" });
    await act({ ...START, setting: "Units", options: "g, oz" });
    await act(READ());

    await act({ type: "cancel" });

    expect(shownState()?.screen).toEqual({ stage: "idle" });
    expect(shownState()?.results.map(({ setting }) => setting)).toEqual(["Sound"]);
  });
});

describe("createInvestigation export", () => {
  test("downloads every finished setting as one JSON file", async () => {
    const { scale } = stubScale([{ sound: "01" }, { sound: "00" }, { sound: "01" }]);
    const { act } = investigate(scale);
    await act(START);
    for (let step = 0; step < 3; step++) await act(READ());
    const answers = new FormData();
    answers.set("model", "AL008");
    answers.set("modelYear", "2021");
    answers.set("firmware", "2.6");

    await act({ type: "export", answers });

    const [fileName, json] = vi.mocked(downloadText).mock.calls[0] ?? [];
    expect(fileName).toBe("AL008_fw2.6_settings-investigation.json");
    const frames = (sound: string) => ({ efdd08: settings(sound) });
    expect(JSON.parse(json ?? "")).toEqual({
      header: {
        scale: "Acaia PEARL",
        model: "AL008",
        modelYear: 2021,
        firmware: "2.6",
        exportedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
      },
      settings: [
        {
          setting: "Sound",
          options: ["on", "off"],
          steps: [
            { option: "on", fixtureFile: "fixture-1.jsonl", frames: frames("01") },
            { option: "off", fixtureFile: "fixture-2.jsonl", frames: frames("00") },
            { option: "on", fixtureFile: "fixture-3.jsonl", frames: frames("01") },
          ],
          findings: [
            {
              kind: "efdd08",
              index: 9,
              values: { on: "01", off: "00" },
              follows: true,
              note: "follows Sound: on 01 · off 00",
            },
          ],
        },
      ],
    });
  });

  test("refuses a model that looks like a device identifier and downloads nothing", async () => {
    const { scale } = stubScale([]);
    const { act, shownState } = investigate(scale);
    const answers = new FormData();
    answers.set("model", "PEARLSD9F8BC");

    await act({ type: "export", answers });

    expect(shownState()?.problem).toMatch(/^Export failed: model "PEARLSD9F8BC" contains D9F8BC/);
    expect(downloadText).not.toHaveBeenCalled();
  });
});
