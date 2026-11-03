// Vitest (through Vite) loads a file's text with `?raw`, so tests can read fixtures without Node APIs.
declare module "*.jsonl?raw" {
  const text: string;
  // biome-ignore lint/style/noDefaultExport: Vite's `?raw` import is a default export.
  export default text;
}
