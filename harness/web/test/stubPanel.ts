import { type Mock, vi } from "vitest";
import type { ScalePanel } from "../createScalePanel.js";

/** A panel whose every method is a spy. */
export type StubPanel = { [Method in keyof ScalePanel]: Mock<ScalePanel[Method]> };

/** A panel for driving a scale without the page's markup. */
export function stubPanel(): StubPanel {
  return {
    show: vi.fn<ScalePanel["show"]>(),
    setConnection: vi.fn<ScalePanel["setConnection"]>(),
    setControls: vi.fn<ScalePanel["setControls"]>(),
    setCommands: vi.fn<ScalePanel["setCommands"]>(),
    showRecordings: vi.fn<ScalePanel["showRecordings"]>(),
    log: vi.fn<ScalePanel["log"]>(),
    addError: vi.fn<ScalePanel["addError"]>(),
    addNote: vi.fn<ScalePanel["addNote"]>(),
    onAction: vi.fn<ScalePanel["onAction"]>(),
    onExport: vi.fn<ScalePanel["onExport"]>(),
    onDiscard: vi.fn<ScalePanel["onDiscard"]>(),
    onFindEarlier: vi.fn<ScalePanel["onFindEarlier"]>(),
  };
}
