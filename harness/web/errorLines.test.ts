import { describe, expect, test } from "vitest";

import { addErrorLine, describeErrorLine, type ErrorLine, MAX_ERRORS_SHOWN } from "./errorLines.js";

function shown(texts: string[]): string[] {
  const lines: ErrorLine[] = [];
  for (const text of texts) addErrorLine(lines, text);
  return lines.map(describeErrorLine);
}

describe("addErrorLine", () => {
  test("collapses consecutive identical errors into one line with a count", () => {
    expect(shown(["timed out", "timed out", "timed out", "timed out"])).toEqual(["timed out (×4)"]);
  });

  test("starts a new line when the error changes, even back to an earlier one", () => {
    expect(shown(["a", "a", "b", "a"])).toEqual(["a (×2)", "b", "a"]);
  });

  test("keeps only the newest lines", () => {
    const texts = Array.from({ length: MAX_ERRORS_SHOWN + 1 }, (_, i) => `error ${i}`);

    const lines = shown(texts);

    expect(lines).toHaveLength(MAX_ERRORS_SHOWN);
    expect(lines[0]).toBe("error 1");
  });
});
