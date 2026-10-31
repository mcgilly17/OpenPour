import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/drivers/acaia/index.ts",
    "src/transports/ble-plx/index.ts",
    "src/transports/replay/index.ts",
  ],
  format: "esm",
  unbundle: true,
  fixedExtension: false,
  // Oxc emits .d.ts from isolatedDeclarations, avoiding the unstable TS 7 compiler API.
  dts: { generator: "oxc" },
  publint: true,
  attw: { profile: "esm-only" },
});
