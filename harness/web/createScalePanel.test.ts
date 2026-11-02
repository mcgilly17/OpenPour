import { describe, expect, test, vi } from "vitest";

import { createScalePanel, LOG_ROWS_SHOWN } from "./createScalePanel.js";

describe("createScalePanel", () => {
  test("keeps the newest LOG_ROWS_SHOWN log rows, each keeping its key", () => {
    const panel = createScalePanel();

    for (let t = 0; t <= LOG_ROWS_SHOWN; t++) panel.log({ kind: "marker", t, text: "" });
    const { log } = panel.getSnapshot();

    expect(log).toHaveLength(LOG_ROWS_SHOWN);
    expect(log[0]).toMatchObject({ id: 1, entry: { t: 1 } });
  });

  test("tells subscribers of each change with a new snapshot, leaving earlier ones as they were", () => {
    const panel = createScalePanel();
    const listener = vi.fn();
    panel.subscribe(listener);
    panel.addError("timed out");
    const before = panel.getSnapshot();

    panel.addError("timed out");
    panel.addNote("no serial");

    expect(listener).toHaveBeenCalledTimes(3);
    expect(before.errors).toEqual([{ text: "timed out", count: 1 }]);
    expect(panel.getSnapshot().errors).toEqual([
      { text: "timed out", count: 2 },
      { text: "Note: no serial", count: 1 },
    ]);
  });

  test("passes the page's clicks to the handlers its scale registered", () => {
    const panel = createScalePanel();
    const tare = vi.fn();
    const onExport = vi.fn();
    panel.onAction("tare", tare);
    panel.onExport(onExport);
    const answers = new FormData();

    panel.act("tare");
    panel.act("disconnect");
    panel.exportFixture(answers);

    expect(tare).toHaveBeenCalledOnce();
    expect(onExport).toHaveBeenCalledWith(answers);
  });
});
