export interface CourseProviderDefinition {
  id: string
  label: string
  domains: readonly string[]
  preference: number
  accessNote: string
}

/**
 * One provider registry drives URL policy, prompt copy, and catalog ranking.
 * Adding a provider in only one of those places previously caused valid links
 * to be silently removed after generation.
 */
export const COURSE_PROVIDERS = [
  {
    id: 'curated',
    label: 'Tailr reviewed',
    domains: [] as const,
    preference: 100,
    accessNote: 'reviewed by Tailr',
  },
  {
    id: 'udemy',
    label: 'Udemy',
    domains: ['udemy.com'] as const,
    preference: 90,
    accessNote: 'free or clearly low-cost',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    domains: ['youtube.com', 'youtu.be'] as const,
    preference: 85,
    accessNote: 'complete tutorials from vetted channels',
  },
  {
    id: 'freecodecamp',
    label: 'freeCodeCamp',
    domains: ['freecodecamp.org'] as const,
    preference: 84,
    accessNote: 'free',
  },
  {
    id: 'microsoft-learn',
    label: 'Microsoft Learn',
    domains: ['learn.microsoft.com'] as const,
    preference: 80,
    accessNote: 'free official training',
  },
  {
    id: 'google',
    label: 'Google training',
    domains: [
      'skillshop.exceedlms.com',
      'skillshop.withgoogle.com',
      'grow.google',
      'developers.google.com',
    ] as const,
    preference: 78,
    accessNote: 'free official training',
  },
  {
    id: 'khan-academy',
    label: 'Khan Academy',
    domains: ['khanacademy.org'] as const,
    preference: 76,
    accessNote: 'free',
  },
  {
    id: 'mit-ocw',
    label: 'MIT OpenCourseWare',
    domains: ['ocw.mit.edu'] as const,
    preference: 68,
    accessNote: 'free; prefer focused modules over long programmes',
  },
  {
    id: 'coursera',
    label: 'Coursera',
    domains: ['coursera.org'] as const,
    preference: 64,
    accessNote: 'only when audit access is free',
  },
  {
    id: 'aws',
    label: 'AWS Skill Builder',
    domains: ['aws.amazon.com', 'skillbuilder.aws'] as const,
    preference: 62,
    accessNote: 'free-tier official training',
  },
  {
    id: 'codecademy',
    label: 'Codecademy',
    domains: ['codecademy.com'] as const,
    preference: 60,
    accessNote: 'free modules only',
  },
  {
    id: 'w3schools',
    label: 'W3Schools',
    domains: ['w3schools.com'] as const,
    preference: 58,
    accessNote: 'free tutorials',
  },
] as const satisfies readonly CourseProviderDefinition[]

export const ALLOWED_COURSE_DOMAINS = [
  ...new Set(COURSE_PROVIDERS.flatMap((provider) => [...provider.domains])),
]

export function providerForUrl(rawUrl: string): CourseProviderDefinition | null {
  let host: string
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    host = url.hostname.toLowerCase()
  } catch {
    return null
  }

  return COURSE_PROVIDERS.find((provider) =>
    provider.domains.some((domain) => host === domain || host.endsWith(`.${domain}`)),
  ) ?? null
}

export function providerPreference(providerId: string): number {
  return COURSE_PROVIDERS.find((provider) => provider.id === providerId)?.preference ?? 0
}

export function providerLabel(providerId: string): string {
  return COURSE_PROVIDERS.find((provider) => provider.id === providerId)?.label ?? providerId
}

export function courseProviderPrompt(): string {
  const providers = COURSE_PROVIDERS
    .filter((provider) => provider.domains.length > 0)
    .sort((a, b) => b.preference - a.preference)
    .map((provider) => `${provider.label} (${provider.accessNote})`)
    .join(', ')

  return `When the supplied Tailr catalog cannot cover a skill, search only these providers in preference order: ${providers}. Prefer focused resources completable in days, normally under 10 hours.`
}
