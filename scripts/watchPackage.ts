import { build } from "tsdown";

/** Printed when a build fails before any has succeeded, so the launcher isn't silently stuck. */
export const WAITING_FOR_BUILD =
  "pnpm harness: waiting for a successful build of src/ before serving the page. Fix the build error below; the page starts once src/ builds.";

/**
 * Starts tsdown in watch mode; resolves once a build has written dist/. tsdown's watcher never
 * reports a failed first build to its hooks, so a plugin watches for it instead. Rejects only when
 * tsdown can't start watching at all, such as on a broken config.
 */
export function watchPackage(): Promise<void> {
  return new Promise((resolve, reject) => {
    let hasBuilt = false;
    const reportFailedBuild = {
      name: "harness:report-failed-build",
      // Runs before tsdown prints the build's error.
      buildEnd(error?: Error): void {
        if (error && !hasBuilt) console.error(WAITING_FOR_BUILD);
      },
    };
    const built = (): void => {
      hasBuilt = true;
      resolve();
    };
    // clean: false makes rebuilds overwrite dist/ in place, so a page reload never finds it empty.
    build({
      watch: true,
      clean: false,
      plugins: [reportFailedBuild],
      hooks: { "build:done": built },
    }).catch(reject);
  });
}
