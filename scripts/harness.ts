// `pnpm harness`: builds OpenPour's package exports, keeps rebuilding them as src/ changes, and
// serves the web harness, which imports those exports by package name like any consumer.
// One process, so Ctrl-C (or "q" + enter) stops both; tsdown owns the terminal shortcuts.
import { build } from "tsdown";
import { createServer } from "vite";

/** Starts tsdown in watch mode; resolves once the first build has written dist/. */
function watchPackage(): Promise<void> {
  return new Promise((resolve) => {
    // clean: false makes rebuilds overwrite dist/ in place, so a page reload never finds it empty.
    void build({ watch: true, clean: false, hooks: { "build:done": () => resolve() } });
  });
}

await watchPackage();
const server = await createServer({ configFile: false, root: "harness/web" });
await server.listen();
server.printUrls();
