import { type Mock, vi } from "vitest";
import type { ScalePanel } from "../createScalePanel.js";

/** A panel whose every method is a spy. */
export type StubPanel = { [Method in keyof ScalePanel]: Mock<ScalePanel[Method]> };

/** A panel for driving a scale without the page's markup. */
export function stubPanel(): StubPanel {
  return {
    show: vi.fn<ScalePanel["show"]>(),
    setConnection: vi.fn<ScalePanel["setConnection"]>(),
    addError: vi.fn<ScalePanel["addError"]>(),
    addNote: vi.fn<ScalePanel["addNote"]>(),
    onAction: vi.fn<ScalePanel["onAction"]>(),
    onExport: vi.fn<ScalePanel["onExport"]>(),
  };
}
