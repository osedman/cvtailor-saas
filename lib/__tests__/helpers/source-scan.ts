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

/**
 * Everything that draws one screen, not just its page file.
 *
 * Candidate detail stopped being a single file on 14 Sep 2026: it renders as
 * a PAGE (its own sidebar and role header) and as a MODAL over compare, so
 * the evidence itself moved into components/agency/candidate-detail.tsx and
 * the page became a shell. Three guards broke that day — role header
 * present, no dead end, nav in role scope — not because any guarantee had
 * gone, but because they were reading one of the two files.
 *
 * A screen is what renders, not what the route file happens to contain. Use
 * this wherever a guard asserts "this screen shows X".
 */
const DELEGATES: Record<string, string[]> = {
  "app/agencies/roles/[roleId]/candidates/[candidateId]/page.tsx": [
    "components/agency/candidate-detail.tsx",
  ],
}

export const screenSource = (path: string): string => {
  // Required lazily so the pure string helpers above stay importable
  // anywhere, including from code that has no filesystem.
  const { readFileSync } = require("fs") as typeof import("fs")
  const { join } = require("path") as typeof import("path")
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
  return [path, ...(DELEGATES[path] ?? [])].map(read).join("\n")
}
