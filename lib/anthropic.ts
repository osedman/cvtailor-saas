import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// ── Two-pass pipeline types ─────────────────────────────────────────────
// Pass 1 (Haiku, fast): extract JD requirements and map each to CV evidence.
// The match score is then COMPUTED from this mapping, not asked of the model.

export type EvidenceStrength = "strong" | "transferable" | "partial" | "none"

export interface RequirementMapping {
  requirement: string          // the JD requirement, paraphrased concisely
  type: "must" | "nice"        // must-have vs nice-to-have
  keywords: string[]           // exact keyword phrases from the JD for this requirement
  strength: EvidenceStrength   // how well the CV supports it
  evidence: string             // short quote/paraphrase of the CV evidence ('' if none)
}

export type RoleFamily =
  | "engineering" | "data" | "product" | "design" | "marketing" | "sales"
  | "finance" | "operations" | "hr" | "healthcare" | "education" | "legal"
  | "customer-service" | "trades" | "other"

export interface ExtractResult {
  jobTitle: string
  companyName: string
  roleFamily: RoleFamily
  seniority: "entry" | "mid" | "senior" | "lead" | "executive"
  requirements: RequirementMapping[]
}

/** Per-family rewrite guidance injected into the rewrite prompt */
export const ROLE_GUIDANCE: Record<RoleFamily, string> = {
  engineering: "Lead bullets with the technical outcome (latency, uptime, scale, cost) and name the stack precisely. Recruiters scan for specific languages/frameworks — keep a tight, honest tech list.",
  data: "Quantify data scale and business impact of analyses/models. Name tools exactly (SQL flavours, dbt, Python libs, BI tools). Distinguish building pipelines from consuming them.",
  product: "Frame bullets as outcome → metric (activation, retention, revenue). Show evidence of prioritisation, stakeholder alignment and shipped launches, not feature lists.",
  design: "Emphasise the problem solved and measured impact of design decisions; name methods (research, prototyping, design systems) and tools concisely.",
  marketing: "Lead with growth/pipeline/ROI numbers and channel specifics. Name platforms and campaign types; avoid vague 'brand awareness' claims without measures.",
  sales: "Numbers first: quota attainment, deal sizes, cycle length, territory growth. Name methodologies (MEDDIC, SPIN) and segments honestly.",
  finance: "Precision and compliance tone. Quantify budgets, savings, audit outcomes; name standards/regulations (IFRS, SOX) and systems (SAP, Oracle) exactly.",
  operations: "Emphasise process improvements with throughput/cost/time metrics; name methodologies (Lean, Six Sigma) only if evidenced.",
  hr: "Quantify headcount supported, time-to-hire, retention improvements; name HRIS systems and frameworks specifically.",
  healthcare: "Lead with patient outcomes, caseloads, compliance and accreditations. Keep clinical terminology exact; registrations/licences prominent.",
  education: "Emphasise learner outcomes, cohort sizes, curriculum development; name qualifications and frameworks precisely.",
  legal: "Precision tone. Name practice areas, matter types and values; emphasise risk mitigated and deals/cases closed.",
  "customer-service": "Quantify volumes, CSAT/NPS, resolution times; name platforms (Zendesk, Salesforce) and escalation experience.",
  trades: "Lead with certifications, tickets and safety record; quantify project sizes and timelines; name equipment/standards exactly.",
  other: "Lead every bullet with the most quantifiable, role-relevant outcome available in the CV.",
}

export interface CompanyAnalysisResult { companyAnalysis: string }

// Core result — assembled by the server from both passes
export interface TailorResult {
  jobTitle: string
  companyName: string
  matchScore: number
  tailoredCV: string
  keyChanges: Array<{ type: "improved" | "reordered" | "removed" | "added"; text: string }>
  gaps: string[]
  followUps: string[]
  atsNotes: { status: "pass" | "warning"; items: string[] }
  // New in the two-pass pipeline (older history rows won't have these)
  requirementsCoverage?: RequirementMapping[]
  keywordCoverage?: { present: string[]; missing: string[] }
  roleFamily?: string
  seniority?: string
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

Punctuation: never use em dashes (—), en dashes (–) or hyphens as sentence punctuation, in any output field. Restructure with commas, colons or separate sentences instead. Hyphenated compound words (e.g. ATS-safe) are fine.

Rules: Truth over optimisation. Every claim must trace to the original CV.`

// Pass 1 — JD requirement extraction + CV evidence mapping (run on Haiku)
export const EXTRACT_TOOL: Anthropic.Tool = {
  name: "submit_requirements_map",
  description: "Submit the job requirements mapped against the candidate's CV evidence.",
  input_schema: {
    type: "object" as const,
    properties: {
      jobTitle: {
        type: "string",
        description: "The exact job title from the job description, e.g. 'Senior Product Manager'",
      },
      companyName: {
        type: "string",
        description: "The hiring company that POSTED this job — extract ONLY from the job description, never from the candidate's CV or work history (the candidate's current/past employers are NOT the hiring company). If the job description does not explicitly name the hiring company, return an empty string.",
      },
      roleFamily: {
        type: "string",
        enum: ["engineering", "data", "product", "design", "marketing", "sales", "finance", "operations", "hr", "healthcare", "education", "legal", "customer-service", "trades", "other"],
        description: "The role's professional family",
      },
      seniority: {
        type: "string",
        enum: ["entry", "mid", "senior", "lead", "executive"],
        description: "Seniority level implied by the JD",
      },
      requirements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            requirement: { type: "string", description: "One JD requirement, concisely paraphrased" },
            type: { type: "string", enum: ["must", "nice"], description: "must-have vs nice-to-have" },
            keywords: {
              type: "array",
              items: { type: "string" },
              description: "1-3 exact keyword phrases from the JD a recruiter/ATS would search for (e.g. 'stakeholder management', 'SQL')",
            },
            strength: {
              type: "string",
              enum: ["strong", "transferable", "partial", "none"],
              description: "strong = direct CV evidence; transferable = adjacent experience; partial = weak hints; none = nothing in the CV",
            },
            evidence: {
              type: "string",
              description: "Short quote or close paraphrase of the CV evidence. Empty string when strength is none.",
            },
          },
          required: ["requirement", "type", "keywords", "strength", "evidence"],
        },
        description: "6-12 distinct requirements covering every must-have in the JD. Judge strength strictly — do not be generous.",
      },
    },
    required: ["jobTitle", "companyName", "roleFamily", "seniority", "requirements"],
  },
}

// Pass 2 — CV rewrite grounded in the requirements map (run on Sonnet).
// Title/company/score are owned by the server, so they're not in this schema.
export const REWRITE_TOOL: Anthropic.Tool = {
  name: "submit_tailored_result",
  description: "Submit the tailored CV and analysis.",
  input_schema: {
    type: "object" as const,
    properties: {
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
        description: "Requirements marked partial/none in the map, phrased as advice, max 4 items",
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
    required: ["tailoredCV", "keyChanges", "gaps", "followUps", "atsNotes"],
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
              description: "One SHORT sentence: what the interviewer is really probing for",
            },
            framework: {
              type: "string",
              description: "How to structure the answer, e.g. 'STAR, lead with the metric'. One short sentence.",
            },
            pointsToHit: {
              type: "array",
              items: { type: "string" },
              description: "2-3 short, specific pieces of evidence from THIS candidate's CV to weave into the answer",
            },
            watchOut: {
              type: "string",
              description: "One SHORT sentence: the pitfall to avoid, specific to this candidate",
            },
          },
          required: ["question", "category", "whyAsked", "framework", "pointsToHit", "watchOut"],
        },
        description: "6-8 questions this candidate is likely to face, mixing categories. Include at least 2 gap-probing questions targeting weak spots between their CV and the JD. Keep every field tight, no filler.",
      },
    },
    required: ["interviewQuestions"],
  },
}

// ── Career roadmap (career-memory Phase 2) ───────────────────────────────

export type CareerItemStatus = "todo" | "in_progress" | "done"

export interface CareerResource {
  title: string
  url: string
  source: string   // e.g. "freeCodeCamp", "MIT OpenCourseWare"
}

export interface CareerRoadmapItem {
  skill: string
  whyItMatters: string
  resources: CareerResource[]
  projectBrief: string
  cvPhrasing: string
  status: CareerItemStatus
  /** ISO timestamp of the last status change — powers "last stitch" momentum. */
  touchedAt?: string
  /** Set when the skill was closed (or attempted) with uploaded evidence. */
  evidence?: SkillEvidence
}

export interface SkillEvidence {
  fileName: string
  judgedAt: string
  verdict: "pass" | "not_yet"
  quality: number          // 1-5
  note: string             // one-line summary of what the evidence showed
}

export interface CareerRoadmapResult {
  items: CareerRoadmapItem[]
}

export const CAREER_ROADMAP_TOOL: Anthropic.Tool = {
  name: "submit_career_roadmap",
  description: "Submit a career roadmap: free resources and a project brief for each skill gap.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            skill: { type: "string", description: "The skill or requirement being addressed, matching the input as closely as possible" },
            whyItMatters: { type: "string", description: "One short sentence on why this skill matters for the target role" },
            resources: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string", description: "The resource's real title" },
                  url: { type: "string", description: "A real, working URL found via search. Never invent a URL." },
                  source: { type: "string", description: "The site/platform, e.g. freeCodeCamp, MIT OpenCourseWare, Khan Academy, official docs" },
                },
                required: ["title", "url", "source"],
              },
              description: "2-3 REAL, FREE, reputable resources found via web search, favouring providers relevant to the candidate's region (see the prompt). Never invent a URL or resource — only include ones actually found via search.",
            },
            projectBrief: { type: "string", description: "A concrete, scoped project idea (2-3 sentences) the candidate could build to demonstrate this skill" },
            cvPhrasing: { type: "string", description: "A single suggested CV bullet point they could add once they have completed the project, written in the same evidence-based style as the rest of Tailr" },
          },
          required: ["skill", "whyItMatters", "resources", "projectBrief", "cvPhrasing"],
        },
        description: "One entry per skill gap provided, ranked most important first. Maximum 5 items.",
      },
    },
    required: ["items"],
  },
}

// ── Region-aware resource sourcing ────────────────────────────────────────
// The candidate's country grounds which learning providers we prefer, so a UK
// user isn't steered to US-only courses. Threaded into every roadmap/upskill
// generation prompt via buildRoadmapPrompt().

/** ISO-3166 alpha-2 region hints → the providers to favour for that market. */
const REGION_PROVIDERS: Record<string, { name: string; providers: string }> = {
  GB: {
    name: "the UK",
    providers:
      "UK-relevant free providers first — OpenLearn / The Open University, FutureLearn (audit/free), the National Careers Service (nationalcareers.service.gov.uk), gov.uk apprenticeship & skills resources, BBC Bitesize/Skills, and reputable UK university OCW — alongside globally free staples (freeCodeCamp, official framework/language docs, Khan Academy, well-known official YouTube channels). Prefer courses with UK spelling, UK qualifications (e.g. NVQ/BTEC/degree apprenticeships) and UK availability. Avoid US-only paid platforms.",
  },
}
const DEFAULT_PROVIDERS =
  "reputable free providers — freeCodeCamp, MIT OpenCourseWare, Khan Academy, official framework/language docs, Coursera/edX audit-mode courses, or well-known official YouTube channels.";

/** Build the shared roadmap/upskill generation prompt, grounded in the
 * candidate's region so course suggestions suit their market. Single source of
 * truth for career-path AND upskill so the two never drift. */
export function buildRoadmapPrompt(opts: {
  skills: string[]
  targetRole?: string
  hoursPerWeek?: number | null
  region?: string | null      // ISO alpha-2, e.g. "GB"
  calibration?: string        // CV + intention grounding, prepended by caller
  intro?: string              // optional override of the first sentence
}): string {
  const region = (opts.region || "GB").toUpperCase()
  const r = REGION_PROVIDERS[region]
  const where = r ? r.name : "their country"
  const providers = r ? r.providers : DEFAULT_PROVIDERS
  const intro =
    opts.intro ??
    `You are helping a job seeker in ${where} close specific skill gaps that keep showing up across their job applications.`
  const time = opts.hoursPerWeek ? `\nTime available: ${opts.hoursPerWeek} hours/week` : ""
  const target = opts.targetRole ? `\nTarget role: ${opts.targetRole}` : ""
  return `${intro} For EACH skill listed below, search the web and find 2-3 REAL, FREE, reputable learning resources. ${providers} Only include resources you actually find via search — never invent a URL or a course that may not exist. For each skill also suggest one concrete, scoped project the candidate could build in their spare time to demonstrate it, and a single CV bullet point they could add once they have completed it.${target}${time}

Skills to address, most important first:
${opts.skills.map((s, i) => `${i + 1}. ${s}`).join("\n")}${opts.calibration ?? ""}`
}

// ── CV findings (career-coach analysis) ───────────────────────────────────
// The climactic "scan your CV" moment: name strengths FIRST, then gaps, in the
// Tailr evidence-based voice. No web search — reads the CV only.

export interface CvFinding { label: string; detail: string }
export interface CvFindings {
  headline: string          // one warm, specific sentence, e.g. "You're a strong delivery lead with…"
  strengths: CvFinding[]     // 3-4, evidence-backed, named first
  gaps: CvFinding[]          // 3-4, honest but constructive
}

export const CV_FINDINGS_TOOL: Anthropic.Tool = {
  name: "submit_cv_findings",
  description: "Submit a career-coach reading of the candidate's CV: their standout strengths (first) and their development gaps. Use ONLY what the CV supports — never invent experience.",
  input_schema: {
    type: "object",
    properties: {
      headline: { type: "string", description: "One warm, specific sentence summarising who this candidate is right now, grounded in the CV." },
      strengths: {
        type: "array",
        description: "3-4 genuine strengths, most impressive first. Evidence-backed from the CV.",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "The strength, a few words e.g. 'Stakeholder leadership'" },
            detail: { type: "string", description: "One sentence of evidence from the CV for it" },
          },
          required: ["label", "detail"],
        },
      },
      gaps: {
        type: "array",
        description: "3-4 honest development gaps for where this person is heading. Constructive, specific.",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "The gap, a few words e.g. 'Formal data modelling'" },
            detail: { type: "string", description: "One sentence on why it matters / what's missing" },
          },
          required: ["label", "detail"],
        },
      },
    },
    required: ["headline", "strengths", "gaps"],
  },
}

// ── North Star suggestions ────────────────────────────────────────────────
// From the CV + stated ambition, propose target roles the candidate could aim
// at. No web search. The user can also type/search their own.

export interface TargetSuggestion { role: string; whyYou: string; fit: number }

export const SUGGEST_TARGETS_TOOL: Anthropic.Tool = {
  name: "submit_target_suggestions",
  description: "Suggest 3-4 realistic 1-2 year target roles ('North Stars') for this candidate based on their CV and stated ambition. Grounded, not aspirational fantasy.",
  input_schema: {
    type: "object",
    properties: {
      targets: {
        type: "array",
        description: "3-4 target roles, best-fit first.",
        items: {
          type: "object",
          properties: {
            role: { type: "string", description: "A concrete job title, e.g. 'Senior Business Analyst', 'Delivery Manager'" },
            whyYou: { type: "string", description: "One sentence on why this fits their trajectory and strengths" },
            fit: { type: "integer", description: "Honest CV-fit estimate 40-95: how much of this role's typical requirements their CV already evidences. Differentiate between suggestions; never all the same number." },
          },
          required: ["role", "whyYou", "fit"],
        },
      },
    },
    required: ["targets"],
  },
}

// ── Role market skills (the "60") ─────────────────────────────────────────
// For a chosen North Star, the skills that role's market demands, each judged
// against the candidate's CV (have/missing). Drives the readiness % and the
// transparent gap map. Uses web search to ground demand in the real market.

export interface RoleSkillJudged { skill: string; have: boolean; importance: "core" | "common" | "edge" }

export const ROLE_SKILLS_TOOL: Anthropic.Tool = {
  name: "submit_role_skills",
  description: "Submit the skills the target role's market demands, each judged against the candidate's CV. Cover the role comprehensively (the full picture the user wants to see), not just gaps.",
  input_schema: {
    type: "object",
    properties: {
      skills: {
        type: "array",
        description: "8-14 skills/requirements this role's market asks for, core ones first. Include ones the candidate already has AND ones they lack.",
        items: {
          type: "object",
          properties: {
            skill: { type: "string", description: "The skill or requirement, concise" },
            have: { type: "boolean", description: "true if the candidate's CV already gives clear evidence of it" },
            importance: { type: "string", enum: ["core", "common", "edge"], description: "how central it is to the role" },
          },
          required: ["skill", "have", "importance"],
        },
      },
    },
    required: ["skills"],
  },
}


// ── Skill evidence review ─────────────────────────────────────────────────
// Completion is earned, not clicked: the user uploads the project artifact or
// course certificate, and the reviewer judges it against the skill's brief.
// Pass → the skill closes with a CV bullet grounded in the ACTUAL evidence.
// Not yet → constructive feedback plus a right-sized replacement project.

export const EVIDENCE_REVIEW_TOOL: Anthropic.Tool = {
  name: "submit_evidence_review",
  description: "Judge uploaded evidence (project document or course certificate) against the skill and its project brief. Be a fair but honest reviewer: substance over polish, never credit what the document doesn't show.",
  input_schema: {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["pass", "not_yet"], description: "pass = the evidence genuinely demonstrates the skill (a completed certificate for the right course/topic, or a project artifact with real substance matching the brief's intent). not_yet = thin, off-topic, incomplete, or clearly not the user's own work." },
      quality: { type: "integer", description: "1-5. 1 = unrelated/empty, 3 = shows effort but gaps, 5 = strong, specific, would impress a hiring manager. Pass requires 3+." },
      note: { type: "string", description: "One sentence on what the evidence showed, e.g. 'UiPath Academy certificate, Advanced RPA Developer, completed'." },
      feedback: { type: "string", description: "2-3 sentences to the candidate. On pass: what makes it strong + one sharpening tip. On not_yet: what's missing, specifically and kindly — never shaming." },
      cvPhrasing: { type: "string", description: "ONLY on pass: one CV bullet grounded in what the evidence ACTUALLY shows (its real scope, numbers, tools) — not the hypothetical brief." },
      suggestedProject: { type: "string", description: "ONLY on not_yet: a right-sized replacement or refined project brief (2-3 sentences) the candidate can realistically complete — smaller if the original was too ambitious, sharper if the submission was off-target." },
    },
    required: ["verdict", "quality", "note", "feedback"],
  },
}


// ── Career Arc (career highlight reel) ────────────────────────────────────

export interface CareerProfileIdentity {
  name: string
  roleLine: string
  supportingLine: string
}

export interface CareerProfileStat {
  value: string
  label: string
}

export interface CareerProfileTimelineItem {
  company: string
  title: string
  start: string
  end: string
  highlights: string[]
}

export interface CareerProfileOrganisation {
  name: string
  roleCount: number
  span: string
}

export interface CareerProfileSkill {
  name: string
  category: string
}

export interface CareerProfileProject {
  title: string
  summary: string
  featured: boolean
}

export interface CareerProfileQuality {
  label: string
  evidence: string
  icon: string
}

export interface CareerProfileMilestone {
  year: string
  label: string
}

export interface CareerProfileGrowth {
  fromTitle: string
  toTitle: string
  tenureYears: number | null
  milestones: CareerProfileMilestone[]
}

export interface CareerProfileStory {
  origin: string
  turningPoint: string
  ambition: string
}

export interface CareerProfileChapter {
  span: string
  name: string
  summary: string
}

export interface CareerProfileSections {
  identity: CareerProfileIdentity
  stats: CareerProfileStat[]
  achievements: CareerProfileStat[]
  timeline: CareerProfileTimelineItem[]
  organisations: CareerProfileOrganisation[]
  skills: CareerProfileSkill[]
  growth: CareerProfileGrowth
  chapters: CareerProfileChapter[]
  story: CareerProfileStory
  projects: CareerProfileProject[]
  qualities: CareerProfileQuality[]
}

export interface CareerQuestion {
  key: "origin" | "turning_point" | "proudest" | "ambition"
  question: string
}

export const CAREER_QUESTIONS_TOOL: Anthropic.Tool = {
  name: "submit_career_questions",
  description: "Submit 4 short, personalised questions for the candidate, each referencing specific facts from their CV (their actual first role, their actual title changes, their actual projects). Never reference anything not in the CV.",
  input_schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string", enum: ["origin", "turning_point", "proudest", "ambition"], description: "Which story slot this question fills" },
            question: {
              type: "string",
              description: "One warm, specific question under 25 words. origin: what drew them to their actual first role (name it). turning_point: what changed between their two most significant titles (name them). proudest: which project they're proudest of and why. ambition: where they want this career to go next.",
            },
          },
          required: ["key", "question"],
        },
        description: "Exactly 4 questions, one per key, in the order origin, turning_point, proudest, ambition",
      },
    },
    required: ["questions"],
  },
}

export const CAREER_PROFILE_TOOL: Anthropic.Tool = {
  name: "submit_career_profile",
  description: "Extract a factual career highlight reel from a CV. Every fact must come directly from the CV text (or, for the story fields only, the candidate's own written answers). Never invent facts, dates, numbers, or achievements. If a section can't be confidently filled, return it empty rather than guessing.",
  input_schema: {
    type: "object",
    properties: {
      identity: {
        type: "object",
        properties: {
          name: { type: "string", description: "The candidate's name exactly as it appears in the CV. Empty string if not present." },
          roleLine: { type: "string", description: "Their professional identity in 8 words or fewer, e.g. 'Automation and AI transformation leader'. Short and punchy — this renders large. Drawn from their most senior/current role, never invented." },
          supportingLine: { type: "string", description: "One fuller sentence of supporting context (sectors, specialisms) drawn from the CV. Renders small." },
        },
        required: ["name", "roleLine", "supportingLine"],
      },
      stats: {
        type: "array",
        items: {
          type: "object",
          properties: {
            value: { type: "string", description: "Short value, e.g. '10', '8', '4'" },
            label: { type: "string", description: "1-2 word lowercase label, e.g. 'years', 'roles', 'organisations', 'sectors'" },
          },
          required: ["value", "label"],
        },
        description: "3-4 headline stats, each directly countable from the CV: years of experience, number of roles, number of organisations, number of sectors. Only include 'promotions' or 'certifications' if the CV explicitly states them. Never invent a number.",
      },
      achievements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            value: { type: "string", description: "The number/figure exactly as written in the CV, e.g. '£2.5M+', '65%', '$3M'" },
            label: { type: "string", description: "Short sentence-case description of what the number is, from the CV" },
          },
          required: ["value", "label"],
        },
        description: "Up to 4 quantified achievements whose figures appear LITERALLY in the CV text. If the CV contains no figures, return an empty array — never manufacture one.",
      },
      timeline: {
        type: "array",
        items: {
          type: "object",
          properties: {
            company: { type: "string", description: "Company name exactly as in the CV" },
            title: { type: "string", description: "Job title exactly as in the CV" },
            start: { type: "string", description: "Start date as in the CV, e.g. '2021' or 'Jan 2021'" },
            end: { type: "string", description: "End date as in the CV, e.g. '2023' or 'Present'" },
            highlights: { type: "array", items: { type: "string" }, description: "1-2 strongest bullets from this role, from the CV (lightly tightened, no added facts)" },
          },
          required: ["company", "title", "start", "end", "highlights"],
        },
        description: "Every role in the CV, ordered chronologically oldest to newest",
      },
      organisations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Organisation name exactly as in the CV" },
            roleCount: { type: "number", description: "How many distinct roles they held there, counted from the CV" },
            span: { type: "string", description: "Short tenure text derived from CV dates, e.g. '3 yrs' or '2019-2022'. Empty if dates unclear." },
          },
          required: ["name", "roleCount", "span"],
        },
        description: "Each distinct organisation in the CV, most recent first",
      },
      skills: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Skill exactly as listed or clearly evidenced in the CV" },
            category: { type: "string", description: "Short grouping label, e.g. 'Technical', 'Leadership', 'Domain'" },
          },
          required: ["name", "category"],
        },
        description: "Skills explicitly listed or clearly evidenced in the CV, grouped by category",
      },
      growth: {
        type: "object",
        properties: {
          fromTitle: { type: "string", description: "Earliest job title in the CV. Empty if only one role." },
          toTitle: { type: "string", description: "Most recent/current job title" },
          tenureYears: { type: "number", description: "Total years spanned by the CV's dates. Null if unclear." },
          milestones: {
            type: "array",
            items: {
              type: "object",
              properties: {
                year: { type: "string", description: "Year of the milestone, from CV dates" },
                label: { type: "string", description: "5 words max, e.g. 'First senior title' or 'Moved into consulting'. Must reflect an actual CV transition." },
              },
              required: ["year", "label"],
            },
            description: "2-3 genuine turning points visible in the CV's role progression (first role, first senior title, latest step). Labels stay under 5 words so they render cleanly.",
          },
        },
        required: ["fromTitle", "toTitle", "tenureYears", "milestones"],
      },
      chapters: {
        type: "array",
        items: {
          type: "object",
          properties: {
            span: { type: "string", description: "The era's year range from CV dates, e.g. '2016-2019'" },
            name: { type: "string", description: "A short evocative chapter name, 2-4 words, e.g. 'The foundations', 'Going senior', 'Leading the change'. Grounded in what actually happened in those roles, never invented." },
            summary: { type: "string", description: "One sentence-case line describing the era, drawn from the CV roles it covers (and the candidate's answers if given)" },
          },
          required: ["span", "name", "summary"],
        },
        description: "The career told as 2-3 named eras. Cluster consecutive roles into chapters by seniority/theme shifts visible in the CV. Chronological order, oldest first.",
      },
      story: {
        type: "object",
        properties: {
          origin: { type: "string", description: "The candidate's own answer about how their career started, lightly cleaned up (typos/grammar only) but kept in their voice and first person. Empty string if they gave no answer." },
          turningPoint: { type: "string", description: "Their own answer about their turning point, same treatment. Empty string if no answer." },
          ambition: { type: "string", description: "Their own answer about where they're heading, same treatment. Empty string if no answer." },
        },
        required: ["origin", "turningPoint", "ambition"],
      },
      projects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short project name drawn from the CV bullet describing it" },
            summary: { type: "string", description: "1-2 sentences describing it, from CV content" },
            featured: { type: "boolean", description: "true for AT MOST ONE project: the one the candidate named as their proudest in their answers. If they didn't answer, all false." },
          },
          required: ["title", "summary", "featured"],
        },
        description: "2-4 project-shaped achievements from role bullets — distinct scoped pieces of work, not routine responsibilities",
      },
      qualities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "1-3 words, e.g. 'Governance architect', 'ROI-driven', 'Scaler'" },
            evidence: { type: "string", description: "One short sentence-case line of proof citing the repeated CV pattern, e.g. 'Built formal RPA governance frameworks in three separate roles'" },
            icon: { type: "string", enum: ["shield", "chart", "users", "rocket", "target", "layers", "book", "tool"], description: "Closest matching icon for the trait" },
          },
          required: ["label", "evidence", "icon"],
        },
        description: "3-5 professional traits inferred ONLY from repeated patterns in the CV's language. Ground every trait in an actual repeated pattern; never invent one.",
      },
    },
    required: ["identity", "stats", "achievements", "timeline", "organisations", "skills", "growth", "chapters", "story", "projects", "qualities"],
  },
}
