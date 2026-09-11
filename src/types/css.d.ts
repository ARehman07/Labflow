/**
 * Plain stylesheet imports, e.g. `import './globals.css'` in the root layout.
 *
 * Next's own types only declare CSS *modules*. Newer TypeScript checks
 * side-effect imports too (`noUncheckedSideEffectImports`), and without this
 * an editor running that version flags the import as a missing module even
 * though the build resolves it.
 */
declare module '*.css';
