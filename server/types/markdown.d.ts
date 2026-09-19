/**
 * Markdown imported as text.
 *
 * Three consumers have to agree on this shape:
 *   - the Worker bundle, via the `Text` rule in deploy/system-wrangler.jsonc,
 *   - vitest, via the `markdown-as-text` plugin in vitest.config.ts,
 *   - tsc, via this declaration.
 *
 * `vite/client` declares `*.txt` but not `*.md`, so without this `npm run check` fails
 * on any markdown import.
 */
declare module '*.md' {
  const content: string;
  export default content;
}
