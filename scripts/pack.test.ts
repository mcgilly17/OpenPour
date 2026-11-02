import { execSync } from "node:child_process";
import { expect, test } from "vitest";
import manifest from "../package.json" with { type: "json" };

// The harness and what it alone needs (Vite, Bluetooth libraries, the page's React, Tailwind and
// Radix, and their types) are dev-only.
const DEV_ONLY_PACKAGE = /vite|bluetooth|noble|\bble\b|react|tailwind|radix|lucide|jsdom/i;
const RUNTIME_FIELDS = ["dependencies", "peerDependencies", "optionalDependencies"];

interface PackResult {
  files: { path: string }[];
}

test("the packed package contains no harness files", () => {
  // npm, because releases publish with it (ADR 0006). --dry-run lists files without a tarball.
  const output = execSync("npm pack --dry-run --json --ignore-scripts", {
    encoding: "utf8",
    stdio: "pipe",
  });
  const [packed] = JSON.parse(output) as PackResult[];
  const paths = packed?.files.map((file) => file.path) ?? [];

  expect(paths).toContain("package.json");
  expect(paths.filter((path) => path.startsWith("harness/"))).toEqual([]);
});

test("no harness, Bluetooth or Vite package is a runtime dependency", () => {
  const fields: Record<string, unknown> = manifest;
  const names = RUNTIME_FIELDS.flatMap((field) => Object.keys(fields[field] ?? {}));

  expect(names.filter((name) => DEV_ONLY_PACKAGE.test(name))).toEqual([]);
});
