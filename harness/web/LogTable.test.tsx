// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import type { FixtureRecord } from "openpour/replay";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { PacketRun } from "./comparePackets.js";
import type { LogRow } from "./createScalePanel.js";
import { LogTable } from "./LogTable.js";
import type { MarkSlot } from "./Marks.js";

afterEach(cleanup);

const rx = (t: number, hex: string): FixtureRecord => ({ t, dir: "rx", svc: "s", chr: "n", hex });
const FIRST_HALF = rx(10, "efdd08");
const SECOND_HALF = rx(20, "094e02");
const ROWS: LogRow[] = [
  { id: 0, entry: { kind: "packet", recording: 1, record: FIRST_HALF } },
  { id: 1, entry: { kind: "event", t: 15, event: { type: "battery", percent: 50 } } },
  { id: 2, entry: { kind: "packet", recording: 1, record: SECOND_HALF } },
];

describe("LogTable", () => {
  test("A marks one rx row, and shift-clicking A on a later row extends the mark over both", () => {
    const onMark = vi.fn<(slot: MarkSlot, run: PacketRun) => void>();
    const { container } = render(<LogTable rows={ROWS} marks={{}} onMark={onMark} />);
    const markButton = (rowId: number) => {
      const row = container.querySelector<HTMLElement>(`[data-row="${rowId}"]`);
      if (!row) throw new Error(`no row ${rowId}`);
      return within(row).getByRole("button", { name: "A" });
    };

    fireEvent.click(markButton(0));
    fireEvent.click(markButton(2), { shiftKey: true });

    expect(onMark.mock.calls).toEqual([
      ["A", { recording: 1, records: [FIRST_HALF] }],
      ["A", { recording: 1, records: [FIRST_HALF, SECOND_HALF] }],
    ]);
  });

  test("hides rows by kind and freezes the rows on screen while paused", () => {
    const { container, getByLabelText, getByRole, rerender } = render(
      <LogTable rows={ROWS.slice(0, 1)} marks={{}} onMark={() => {}} />,
    );
    const rowIds = () =>
      Array.from(container.querySelectorAll("[data-row]")).map((row) =>
        row.getAttribute("data-row"),
      );

    fireEvent.click(getByRole("button", { name: "Pause display" }));
    rerender(<LogTable rows={ROWS} marks={{}} onMark={() => {}} />);
    expect(rowIds()).toEqual(["0"]);

    fireEvent.click(getByRole("button", { name: "Resume display" }));
    fireEvent.click(getByLabelText("other events"));
    expect(rowIds()).toEqual(["0", "2"]);
  });
});
