import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// Core result — fast to generate (~15-25s)
export interface TailorResult {
  jobTitle: string
  companyName: string
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

export type QuestionCategory = "behavioural" | "technical" | "role-specific" | "motivation" | "gap-probing"

export interface InterviewPrepResult {
  interviewQuestions: Array<{
    question: string
    category: QuestionCategory
    whyAsked: string        // what the interviewer is really probing
    framework: string       // how to structure the answer (e.g. STAR, situational)
    pointsToHit: string[]   // specific CV evidence to weave in
    watchOut: string        // common pitfall to avoid
  }>
}

/**
 * House style distilled from reviewed sources: resume.io examples, Harvard FAS
 * career-services sample, Indeed's bad-resume teardown, Jobscan ATS rules, and
 * standard UK (Prospects) CV conventions.
 */
const CV_STANDARDS = `CV writing standards (follow strictly):

STRUCTURE & ORDER
- Header (name + contact) → Professional Summary → Experience (reverse-chronological) → Education → Skills. Single column.
- Professional Summary: 3–4 sentences max, leading with the skills and accomplishments most relevant to THIS job.
- 3–5 bullets per role; the most recent/relevant roles get the most bullets. Drop roles older than ~10 years or sub-3-month stints unless directly relevant.

BULLETS
- Start with a strong action verb (past tense for previous roles, present for current). Structure: verb → what you did → measurable result.
- Quantify wherever the original CV provides numbers (%, £/$, headcount, time saved). Never invent figures.
- No full sentences, no trailing periods, parallel grammar across bullets.
- Ban vague verbs: "helped", "contributed", "was responsible for", "assisted with". Replace with the specific action taken.
- Ban empty clichés: "results-driven", "team player", "hard-working", "go-getter", "think outside the box", "detail-oriented" (show it instead).

SKILLS
- Specific over generic: "Excel (PivotTables, VLOOKUP)" not "Microsoft Office"; name the actual tools, frameworks, methods.
- Exclude baseline skills (email, web research, word processing). Separate hard skills from soft skills; lead with hard.

ATS SAFETY
- Standard section headings only: "Professional Summary", "Work Experience", "Education", "Skills".
- Plain text: no tables, columns, graphics, or symbols beyond simple bullets. Contact details in the body, never implied headers/footers.
- Weave the JD's exact keyword phrasing into summary, bullets and skills where the CV genuinely supports it.

REGIONAL
- Mirror the CV's existing spelling convention (UK vs US). For UK CVs: no photo, no date of birth, no marital status, omit "references available on request".`

export const SYSTEM_PROMPT = `You are an expert CV tailoring assistant. Rewrite the user's CV to best match the target job description, using ONLY evidence from their existing CV — never invent skills, metrics, or responsibilities.

Steps to follow internally:
1. Parse the CV thoroughly: roles, bullets, skills, education, dates, metrics, scope.
2. Analyse the JD: must-haves, nice-to-haves, keywords, seniority level.
3. Map each JD requirement to CV evidence (strong / transferable / partial / none).
4. Reorder sections to lead with strongest evidence. Keep chronology intact.
5. Rewrite bullets: Action → Result format. Mirror JD language where truthful. Remove filler.
6. ATS-safe output: standard headings, plain text, consistent dates, no tables or columns.
7. Score the match 0–100 based on genuine fit.

${CV_STANDARDS}

Length: Keep the tailored CV tight and senior-appropriate — aim for ~450–650 words (one to two pages). Be economical; cut weak bullets rather than padding. Keep every analysis item to a single concise sentence.

Rules: Truth over optimisation. Every claim must trace to the original CV.`

export const TAILOR_TOOL: Anthropic.Tool = {
  name: "submit_tailored_result",
  description: "Submit the tailored CV and analysis.",
  input_schema: {
    type: "object" as const,
    properties: {
      jobTitle: {
        type: "string",
        description: "The exact job title from the job description, e.g. 'Senior Product Manager'",
      },
      companyName: {
        type: "string",
        description: "The hiring company name from the job description. Empty string if not found.",
      },
      matchScore: {
        type: "number",
        description: "0–100 score of how well the CV genuinely matches the JD",
      },
      tailoredCV: {
        type: "string",
        description: "The tailored CV in plain text, ATS-safe formatting. Concise — typically 450–650 words, no padding.",
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
        description: "Specific changes made, each one concise sentence, max 5 items",
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
    required: ["jobTitle", "companyName", "matchScore", "tailoredCV", "keyChanges", "gaps", "followUps", "atsNotes"],
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

export const INTERVIEW_PREP_TOOL: Anthropic.Tool = {
  name: "submit_interview_prep",
  description: "Submit likely interview questions with answer frameworks.",
  input_schema: {
    type: "object" as const,
    properties: {
      interviewQuestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "The interview question, phrased as the interviewer would ask it",
            },
            category: {
              type: "string",
              enum: ["behavioural", "technical", "role-specific", "motivation", "gap-probing"],
              description: "gap-probing = questions targeting weaknesses/gaps between the CV and the JD",
            },
            whyAsked: {
              type: "string",
              description: "One sentence: what the interviewer is really probing for",
            },
            framework: {
              type: "string",
              description: "How to structure the answer, e.g. 'STAR — lead with the metric' or 'Present-Past-Future'. 1-2 sentences.",
            },
            pointsToHit: {
              type: "array",
              items: { type: "string" },
              description: "2-4 specific pieces of evidence from THIS candidate's CV to weave into the answer",
            },
            watchOut: {
              type: "string",
              description: "One common pitfall to avoid when answering, specific to this candidate",
            },
          },
          required: ["question", "category", "whyAsked", "framework", "pointsToHit", "watchOut"],
        },
        description: "8-10 questions this candidate is likely to face, mixing categories. Include at least 2 gap-probing questions targeting weak spots between their CV and the JD.",
      },
    },
    required: ["interviewQuestions"],
  },
}
