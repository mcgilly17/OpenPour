import {
  type ByteCell,
  compareRuns,
  describeDifferences,
  hexByte,
  type PacketRun,
} from "./comparePackets.js";
import type { MarkSlot, Marks } from "./createLogView.js";
import { describeRun, spacedHex } from "./describeRun.js";
import { findElement } from "./findElement.js";

/** How many leading bytes "find earlier" matches on until the contributor changes it. */
export const DEFAULT_PREFIX_BYTES = 3;

export type FindEarlier = (run: PacketRun, prefixBytes: number) => PacketRun[];

export interface CompareView {
  mark(slot: MarkSlot, run: PacketRun): void;
  onMarksChanged(handler: (marks: Marks) => void): void;
  onFindEarlier(handler: FindEarlier): void;
}

function cell(text: string, classes: Record<string, boolean>): HTMLTableCellElement {
  const td = document.createElement("td");
  td.textContent = text;
  for (const [name, isOn] of Object.entries(classes)) td.classList.toggle(name, isOn);
  return td;
}

/** Three rows: byte index, A's bytes and B's, with differing bytes and split points marked. */
function byteRows(cells: readonly ByteCell[]): HTMLTableRowElement[] {
  const row = (label: string, cellOf: (c: ByteCell) => HTMLTableCellElement) => {
    const tr = document.createElement("tr");
    tr.append(
      Object.assign(document.createElement("th"), { textContent: label }),
      ...cells.map(cellOf),
    );
    return tr;
  };
  return [
    row("index", (c) => cell(String(c.index), { diff: c.isDifferent })),
    row("A", (c) =>
      cell(hexByte(c.a), { diff: c.isDifferent, split: c.startsPacketA && c.index > 0 }),
    ),
    row("B", (c) =>
      cell(hexByte(c.b), { diff: c.isDifferent, split: c.startsPacketB && c.index > 0 }),
    ),
  ];
}

/** The comparison in `root`: two marked runs byte by byte, and earlier runs that start like A. */
export function createCompareView(root: HTMLElement): CompareView {
  const part = (name: string) => findElement(root, `[data-compare="${name}"]`, HTMLElement);
  const prefix = findElement(root, '[data-compare="prefix"]', HTMLInputElement);
  const find = findElement(root, '[data-compare="find"]', HTMLButtonElement);
  prefix.value = String(DEFAULT_PREFIX_BYTES);
  const marks: Marks = {};
  let onMarksChanged: (marks: Marks) => void = () => {};
  let findEarlier: FindEarlier = () => [];

  function render(): void {
    const { A, B } = marks;
    part("A").textContent = A
      ? `${describeRun(A)}: ${spacedHex(A.records.map((r) => r.hex).join(""))}`
      : "–";
    part("B").textContent = B
      ? `${describeRun(B)}: ${spacedHex(B.records.map((r) => r.hex).join(""))}`
      : "–";
    const cells = A && B ? compareRuns(A.records, B.records) : [];
    part("bytes").replaceChildren(...(cells.length > 0 ? byteRows(cells) : []));
    part("summary").textContent = A && B ? describeDifferences(cells) : "";
    find.disabled = A === undefined;
    onMarksChanged({ ...marks });
  }

  function mark(slot: MarkSlot, run: PacketRun): void {
    marks[slot] = run;
    render();
  }

  function matchItem(run: PacketRun): HTMLLIElement {
    const item = document.createElement("li");
    const use = Object.assign(document.createElement("button"), {
      type: "button",
      textContent: "Compare as B",
    });
    use.addEventListener("click", () => mark("B", run));
    item.append(`${describeRun(run)}: ${spacedHex(run.records.map((r) => r.hex).join(""))} `, use);
    return item;
  }

  find.addEventListener("click", () => {
    if (!marks.A) return;
    const matches = findEarlier(marks.A, Math.max(1, prefix.valueAsNumber || DEFAULT_PREFIX_BYTES));
    const none = Object.assign(document.createElement("li"), {
      textContent: "No earlier packet starts with these bytes.",
    });
    part("earlier").replaceChildren(...(matches.length > 0 ? matches.map(matchItem) : [none]));
  });
  return {
    mark,
    onMarksChanged(handler) {
      onMarksChanged = handler;
    },
    onFindEarlier(handler) {
      findEarlier = handler;
    },
  };
}
