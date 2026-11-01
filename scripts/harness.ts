// `pnpm harness`: builds OpenPour's package exports, keeps rebuilding them as src/ changes, and
// serves the web harness, which imports those exports by package name like any consumer.
// One process, so Ctrl-C (or "q" + enter) stops both; tsdown owns the terminal shortcuts.
import { createServer } from "vite";
import { watchPackage } from "./watchPackage.ts";

try {
  await watchPackage();
} catch (error) {
  console.error("pnpm harness: tsdown couldn't start building src/, so the page can't start.");
  console.error(error);
  process.exit(1);
}
const server = await createServer({ configFile: false, root: "harness/web" });
await server.listen();
server.printUrls();
