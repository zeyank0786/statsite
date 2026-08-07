/**
 * The App Router runs on Next's vendored React canary build, which exports
 * `<ViewTransition>` even though the installed `react` package is stable 19.x.
 * @types/react ships those declarations in `react/canary` but only loads them
 * when something references them — this file is that reference, project-wide.
 *
 * Without it, `import { ViewTransition } from 'react'` type-errors while the
 * runtime import resolves fine.
 */
/// <reference types="react/canary" />

export {};
