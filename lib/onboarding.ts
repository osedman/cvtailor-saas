/**
 * Client-side onboarding state, persisted in localStorage (per-device, no
 * backend). Steps are marked from across the app via markOnboardingStep();
 * the getting-started checklist re-reads on the "tailr:onboarding" event.
 */

export type OnboardingStep = "cv" | "job" | "tailor" | "prep" | "cover" | "company" | "tracker"

export const ONBOARDING_STEPS: { id: OnboardingStep; label: string; hint: string }[] = [
  { id: "cv", label: "Add your CV", hint: "Upload a PDF or DOCX, or paste it in" },
  { id: "job", label: "Paste a job description", hint: "Or drop a LinkedIn / Indeed link to auto-fill" },
  { id: "tailor", label: "Run your first tailor", hint: "Get an evidence-checked rewrite and match score" },
  { id: "prep", label: "Explore interview prep", hint: "Predicted questions with answer frameworks" },
  { id: "cover", label: "Generate a cover letter", hint: "A tailored cover letter in one click" },
  { id: "company", label: "Research the company", hint: "A quick brief on the company you're applying to" },
  { id: "tracker", label: "Open your job tracker", hint: "Track every application on one board" },
]

const FLAG = (id: OnboardingStep) => `tailr:onboarding:${id}`
const WELCOMED = "tailr:onboarding:welcomed"
const DISMISSED = "tailr:onboarding:dismissed"
// The CV is already persisted by the editor under this key, so reuse it.
const CV_KEY = "cvtailor:cv"

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function safeSet(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* ignore */ }
}

export function isStepDone(id: OnboardingStep): boolean {
  if (id === "cv") return !!safeGet(CV_KEY)
  return safeGet(FLAG(id)) === "1"
}

/** Mark a step complete and notify any mounted checklist to refresh. */
export function markOnboardingStep(id: OnboardingStep) {
  if (id === "cv") return // derived from the CV editor's own storage
  if (safeGet(FLAG(id)) === "1") return
  safeSet(FLAG(id), "1")
  try { window.dispatchEvent(new Event("tailr:onboarding")) } catch { /* ignore */ }
}

export function onboardingProgress(): { done: number; total: number } {
  const done = ONBOARDING_STEPS.filter((s) => isStepDone(s.id)).length
  return { done, total: ONBOARDING_STEPS.length }
}

export function isOnboardingComplete(): boolean {
  return onboardingProgress().done === ONBOARDING_STEPS.length
}

/**
 * The next incomplete step among the core setup flow (cv → job → tailor),
 * used to drive the numbered coachmarks on the workspace. Returns null once
 * the user has run their first tailor (or dismissed onboarding).
 */
export function activeSetupStep(): "cv" | "job" | "tailor" | null {
  if (isOnboardingDismissed()) return null
  if (!isStepDone("cv")) return "cv"
  if (!isStepDone("job")) return "job"
  if (!isStepDone("tailor")) return "tailor"
  return null
}

export function isOnboardingDismissed(): boolean {
  return safeGet(DISMISSED) === "1"
}
export function dismissOnboarding() {
  safeSet(DISMISSED, "1")
  try { window.dispatchEvent(new Event("tailr:onboarding")) } catch { /* ignore */ }
}

export function hasSeenWelcome(): boolean {
  return safeGet(WELCOMED) === "1"
}
export function markWelcomeSeen() {
  safeSet(WELCOMED, "1")
  try { window.dispatchEvent(new Event("tailr:onboarding")) } catch { /* ignore */ }
}
