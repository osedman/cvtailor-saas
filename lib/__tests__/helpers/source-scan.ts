/**
 * Strip comments before scanning source for a rule.
 *
 * Guardrails in this repo work by scanning code for forbidden shapes, and the
 * same trap has now bitten six times: the file EXPLAINS the rule in prose, and
 * a naive scan matches its own documentation. The compliance guard hit it, the
 * right-to-represent guard hit it, and the candidate-removal guard hit it
 * twice in one sitting — once on a doc comment naming the reasons it excludes,
 * once on an inline comment inside the very call being asserted.
 *
 * So the helper lives here rather than being copied a fourth time. If you are
 * writing a source-scanning test, scan tsCode(src) or sqlCode(src), never the
 * raw file — and remember the sibling lesson: a guardrail counts only once a
 * probe has made it fail.
 */

/** TypeScript/TSX with block and line comments removed. */
export const tsCode = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/** SQL with `--` line comments removed. */
export const sqlCode = (src: string): string => src.replace(/^\s*--.*$/gm, "")
