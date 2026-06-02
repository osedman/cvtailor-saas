import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export interface TailorResult {
  matchScore: number
  tailoredCV: string
  keyChanges: Array<{ type: "improved" | "reordered" | "removed" | "added"; text: string }>
  gaps: string[]
  followUps: string[]
  atsNotes: { status: "pass" | "warning"; items: string[] }
  coverLetter: string
  interviewPitches: Array<{
    title: string
    situation: string
    task: string
    action: string
    result: string
    relevantTo: string[]
  }>
}

export const SYSTEM_PROMPT = `You are an AI Resume Tailoring Assistant. You produce the strongest, most credible version of a resume for a specific target role using only evidence from the existing CV. Truthfulness is non-negotiable — never invent skills, metrics, or responsibilities.

Work through these stages internally before calling the tool:

1. Parse the CV: extract all roles, bullets, skills, education, dates, metrics.
2. Analyse the JD: identify must-haves, nice-to-haves, repeated keywords, seniority signals.
3. Map relevance: strong match / transferable / partial / not supported. Every claim must trace to real CV evidence.
4. Reorder and prioritise: lead with strongest evidence for this role. Keep chronology intact.
5. Rewrite bullets: Action → Context → Result. Mirror employer language only where truthful. Remove filler.
6. ATS check: standard headings, single-column plain text, consistent dates.
7. Score the match (0–100): based on how well the CV genuinely covers the JD requirements.
8. Write a cover letter: concise, professional, 3 short paragraphs (hook → evidence → close). Ground every claim in the CV.
9. Generate 2–3 STAR interview pitches drawn from real experience in the CV.

Decision standard: Truth > optimisation. Clarity > creativity. Evidence > assumptions.`

export const TAILOR_TOOL: Anthropic.Tool = {
  name: "submit_tailored_result",
  description: "Submit the complete tailored CV result as structured data.",
  input_schema: {
    type: "object" as const,
    properties: {
      matchScore: {
        type: "number",
        description: "0–100 score of how well the CV matches the JD based on genuine evidence",
      },
      tailoredCV: {
        type: "string",
        description: "Full tailored resume in clean plain text with ATS-safe formatting",
      },
      keyChanges: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["improved", "reordered", "removed", "added"] },
            text: { type: "string" },
          },
          required: ["type", "text"],
        },
        description: "List of specific changes made and why",
      },
      gaps: {
        type: "array",
        items: { type: "string" },
        description: "JD requirements not addressed because the CV doesn't support them",
      },
      followUps: {
        type: "array",
        items: { type: "string" },
        description: "Interview questions the candidate should prepare for based on this role",
      },
      atsNotes: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pass", "warning"] },
          items: { type: "array", items: { type: "string" } },
        },
        required: ["status", "items"],
        description: "ATS readiness assessment",
      },
      coverLetter: {
        type: "string",
        description: "Tailored cover letter in plain text, 3 paragraphs",
      },
      interviewPitches: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            situation: { type: "string" },
            task: { type: "string" },
            action: { type: "string" },
            result: { type: "string" },
            relevantTo: { type: "array", items: { type: "string" } },
          },
          required: ["title", "situation", "task", "action", "result", "relevantTo"],
        },
        description: "2–3 STAR-format interview stories drawn from real CV experience",
      },
    },
    required: [
      "matchScore",
      "tailoredCV",
      "keyChanges",
      "gaps",
      "followUps",
      "atsNotes",
      "coverLetter",
      "interviewPitches",
    ],
  },
}
