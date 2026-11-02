// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { FixtureRecord } from "openpour/replay";
import { afterEach, describe, expect, test } from "vitest";

import { ByteTable } from "./ByteTable.js";
import { compareRuns } from "./comparePackets.js";

afterEach(cleanup);

/** A Lunar settings frame (docs/design.md), and the same after switching its sound off. */
const SETTINGS_BEFORE = "efdd08094e020101000101010e50";
const SETTINGS_AFTER = "efdd08094e020101000001010d50";

const rx = (t: number, hex: string): FixtureRecord => ({ t, dir: "rx", svc: "s", chr: "n", hex });

function indicesOf(row: Element | undefined, attribute: string): string[] {
  const cells = Array.from(row?.querySelectorAll("td") ?? []);
  return cells.flatMap((cell, index) => (cell.hasAttribute(attribute) ? [String(index)] : []));
}

describe("ByteTable", () => {
  test("highlights the bytes that differ and draws a bar where each notification began", () => {
    const before = [rx(0, SETTINGS_BEFORE.slice(0, 6)), rx(10, SETTINGS_BEFORE.slice(6))];
    const after = [rx(20, SETTINGS_AFTER.slice(0, 12)), rx(30, SETTINGS_AFTER.slice(12))];

    const { container } = render(<ByteTable cells={compareRuns(before, after)} />);
    const [indexRow, rowA, rowB] = Array.from(container.querySelectorAll("tr"));

    expect(indicesOf(indexRow, "data-diff")).toEqual(["9", "12"]);
    expect(indicesOf(rowA, "data-diff")).toEqual(["9", "12"]);
    expect(indicesOf(rowA, "data-split")).toEqual(["3"]);
    expect(indicesOf(rowB, "data-split")).toEqual(["6"]);
    expect(rowB?.querySelectorAll("td")[9]?.textContent).toBe("00");
  });
});
