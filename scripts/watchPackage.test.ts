import { build, type InlineConfig } from "tsdown";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WAITING_FOR_BUILD, watchPackage } from "./watchPackage.ts";

vi.mock("tsdown", () => ({ build: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
});

/** Starts watchPackage on a tsdown that never settles, with controls for its build results. */
function watchWithFakeTsdown() {
  let config: InlineConfig = {};
  vi.mocked(build).mockImplementation((inline = {}) => {
    config = inline;
    return new Promise(() => {});
  });
  const watching = watchPackage();
  // The two callbacks watchPackage hands tsdown, narrowed from tsdown's wider option types.
  const [plugin] = config.plugins as unknown as [{ buildEnd(error?: Error): void }];
  const hooks = config.hooks as { "build:done"(): void };
  return {
    watching,
    failBuild: () => plugin.buildEnd(new Error("Unexpected token")),
    finishBuild: () => hooks["build:done"](),
  };
}

describe("watchPackage", () => {
  test("says it's waiting while builds fail, and resolves once one succeeds", async () => {
    const printed = vi.spyOn(console, "error").mockImplementation(() => {});
    const { watching, failBuild, finishBuild } = watchWithFakeTsdown();
    const settled = vi.fn();
    void watching.then(settled);

    failBuild();
    failBuild();
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    finishBuild();
    failBuild();

    await expect(watching).resolves.toBeUndefined();
    expect(printed.mock.calls).toEqual([[WAITING_FOR_BUILD], [WAITING_FOR_BUILD]]);
  });

  test("rejects when tsdown can't start watching", async () => {
    const broken = new Error("config failed to load");
    vi.mocked(build).mockRejectedValueOnce(broken);

    await expect(watchPackage()).rejects.toBe(broken);
  });
});
