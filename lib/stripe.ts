// Stripe is disabled — payments not yet configured.
// All users are treated as Pro (unlimited) in the meantime.

export const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    tailorsPerMonth: 3,
    features: ['3 CV tailors/month', 'ATS optimisation', 'Gap analysis'],
  },
  pro: {
    name: 'Pro',
    price: 12,
    priceId: '',
    tailorsPerMonth: Infinity,
    features: [
      'Unlimited CV tailors',
      'ATS optimisation',
      'Gap analysis',
      'Priority processing',
      'Download as .docx',
    ],
  },
} as const

export type Plan = keyof typeof PLANS
