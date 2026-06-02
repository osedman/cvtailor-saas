import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// Core result — fast to generate (~15-25s)
export interface TailorResult {
  matchScore: number
  tailoredCV: string
  keyChanges: Array<{ type: "improved" | "reordered" | "removed" | "added"; text: string }>
  gaps: string[]
  followUps: string[]
  atsNotes: { status: "pass" | "warning"; items: string[] }
}

// Extended results generated on-demand
export interface CoverLetterResult { coverLetter: string }
export interface PitchesResult {
  interviewPitches: Array<{
    title: string; situation: string; task: string
    action: string; result: string; relevantTo: string[]
  }>
}

export const SYSTEM_PROMPT = `You are an expert CV tailoring assistant. Rewrite the user's CV to best match the target job description, using ONLY evidence from their existing CV — never invent skills, metrics, or responsibilities.

Steps to follow internally:
1. Parse the CV thoroughly: roles, bullets, skills, education, dates, metrics, scope.
2. Analyse the JD: must-haves, nice-to-haves, keywords, seniority level.
3. Map each JD requirement to CV evidence (strong / transferable / partial / none).
4. Reorder sections to lead with strongest evidence. Keep chronology intact.
5. Rewrite bullets: Action → Result format. Mirror JD language where truthful. Remove filler.
6. ATS-safe output: standard headings, plain text, consistent dates, no tables or columns.
7. Score the match 0–100 based on genuine fit.

Rules: Truth over optimisation. Every claim must trace to the original CV.`

export const TAILOR_TOOL: Anthropic.Tool = {
  name: "submit_tailored_result",
  description: "Submit the tailored CV and analysis.",
  input_schema: {
    type: "object" as const,
    properties: {
      matchScore: {
        type: "number",
        description: "0–100 score of how well the CV genuinely matches the JD",
      },
      tailoredCV: {
        type: "string",
        description: "Full tailored CV in plain text, ATS-safe formatting",
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
        description: "Specific changes made, max 6 items",
      },
      gaps: {
        type: "array",
        items: { type: "string" },
        description: "JD requirements the CV cannot support, max 4 items",
      },
      followUps: {
        type: "array",
        items: { type: "string" },
        description: "Interview questions to prepare for this role, max 4 items",
      },
      atsNotes: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pass", "warning"] },
          items: { type: "array", items: { type: "string" } },
        },
        required: ["status", "items"],
        description: "ATS readiness notes, max 4 items",
      },
    },
    required: ["matchScore", "tailoredCV", "keyChanges", "gaps", "followUps", "atsNotes"],
  },
}

export const COVER_LETTER_TOOL: Anthropic.Tool = {
  name: "submit_cover_letter",
  description: "Submit a tailored cover letter.",
  input_schema: {
    type: "object" as const,
    properties: {
      coverLetter: {
        type: "string",
        description: "3-paragraph cover letter: hook → evidence → close. Plain text only.",
      },
    },
    required: ["coverLetter"],
  },
}

export const PITCHES_TOOL: Anthropic.Tool = {
  name: "submit_interview_pitches",
  description: "Submit STAR interview pitches.",
  input_schema: {
    type: "object" as const,
    properties: {
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
        description: "2–3 STAR stories from real CV experience",
      },
    },
    required: ["interviewPitches"],
  },
}
