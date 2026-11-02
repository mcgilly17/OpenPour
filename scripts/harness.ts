// `pnpm harness`: builds OpenPour's package exports, keeps rebuilding them as src/ changes, and
// serves the web harness, which imports those exports by package name like any consumer.
// One process, so Ctrl-C (or "q" + enter) stops both; tsdown owns the terminal shortcuts.
// `pnpm harness --port 5180` serves on that port instead of Vite's default.
import { parseArgs } from "node:util";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { watchPackage } from "./watchPackage.ts";

const { values } = parseArgs({ options: { port: { type: "string" } } });

try {
  await watchPackage();
} catch (error) {
  console.error("pnpm harness: tsdown couldn't start building src/, so the page can't start.");
  console.error(error);
  process.exit(1);
}
// No config file: the page needs only React and Tailwind, so the launcher holds all of it.
const server = await createServer({
  configFile: false,
  root: "harness/web",
  plugins: [react(), tailwindcss()],
  server: values.port === undefined ? {} : { port: Number(values.port), strictPort: true },
});
await server.listen();
server.printUrls();
