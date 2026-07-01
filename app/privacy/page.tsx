import Link from "next/link"
import type { Metadata } from "next"
import { Hanken_Grotesk } from "next/font/google"
import { ArrowLeft } from "lucide-react"

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
})

const ACCENT = "#dc4f33"
const INK = "#1e1813"
const LAST_UPDATED = "1 July 2026"

export const metadata: Metadata = {
  title: "Privacy Policy — Tailr",
  description: "How Tailr collects, uses, and protects your data.",
}

function Wordmark() {
  return (
    <span className="inline-flex items-baseline gap-0.5 text-[20px] font-extrabold tracking-tight" style={{ color: INK }}>
      tailr
      <span className="w-1.5 h-1.5 rounded-full inline-block -translate-y-px" style={{ background: ACCENT }} />
    </span>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 scroll-mt-24" id={id}>
      <h2 className="text-[20px] sm:text-[22px] font-bold tracking-tight text-[#1e1813]">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-gray-600">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <div className={`${hanken.className} min-h-screen bg-white antialiased`} style={{ color: INK }}>
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link href="/" aria-label="Tailr home"><Wordmark /></Link>
          <Link href="/" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-gray-500 hover:text-[#1e1813] transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-14">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ color: ACCENT }}>Legal</p>
        <h1 className="mt-3 text-[clamp(32px,5vw,44px)] font-extrabold tracking-[-0.025em] leading-tight text-[#1e1813]">
          Privacy Policy
        </h1>
        <p className="mt-4 text-[15px] text-gray-500">Last updated: {LAST_UPDATED}</p>

        <div className="mt-8 rounded-2xl border border-gray-100 bg-gray-50/60 p-5 text-[14.5px] leading-relaxed text-gray-600">
          <p>
            Tailr (&ldquo;Tailr&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) helps you tailor your CV to specific jobs.
            This policy explains what personal data we collect, why we collect it, who we share it with, and the
            rights you have over it. Tailr is operated by Tailr Labs in the United Kingdom, and we process personal
            data in line with the UK GDPR and the EU GDPR.
          </p>
        </div>

        <Section id="what-we-collect" title="1. What we collect">
          <p>We collect only what we need to run the service:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="font-semibold text-[#1e1813]">Account data.</strong> Your email address, used for passwordless (magic-link) sign-in.</li>
            <li><strong className="font-semibold text-[#1e1813]">Content you provide.</strong> The CVs you upload or paste, the job descriptions and job links you add, and any notes or feedback you enter.</li>
            <li><strong className="font-semibold text-[#1e1813]">Results we generate.</strong> Tailored CV versions, match scores, interview prep, and company research, saved to your history so you can return to them.</li>
            <li><strong className="font-semibold text-[#1e1813]">Job tracker data.</strong> The applications and stages you track.</li>
            <li><strong className="font-semibold text-[#1e1813]">Technical and security data.</strong> When you sign in we record the event, including your IP address and browser user-agent, to protect your account and detect abuse.</li>
            <li><strong className="font-semibold text-[#1e1813]">Usage analytics.</strong> Privacy-friendly, aggregated usage measurement to understand how the product is used.</li>
          </ul>
          <p>We do not knowingly collect data from anyone under 16, and Tailr is not intended for children.</p>
        </Section>

        <Section id="how-we-use" title="2. How we use your data">
          <ul className="list-disc pl-5 space-y-2">
            <li>To provide the core service: tailoring your CV, scoring the match, generating prep, and saving your history and tracker.</li>
            <li>To authenticate you and keep your account secure.</li>
            <li>To send you service messages (for example, your sign-in link and a one-time welcome email).</li>
            <li>To send you product updates if you have signed up, which you can opt out of at any time.</li>
            <li>To understand and improve how the product works.</li>
          </ul>
          <p>
            Our legal bases are: performance of our contract with you (to deliver the service), your consent (for
            product update emails), and our legitimate interests (security, abuse prevention, and improving Tailr).
          </p>
        </Section>

        <Section id="ai-processing" title="3. AI processing of your CV">
          <p>
            To tailor your CV, the text of your CV and the job description are sent to our AI provider, Anthropic
            (the maker of Claude), which processes them to produce your results. For company research, the company
            name and role context are used to run a web search. We send only what is needed to generate your output,
            and we never sell your data or use it to train third-party models.
          </p>
        </Section>

        <Section id="sharing" title="4. Who we share it with">
          <p>We do not sell your personal data. We share it only with the service providers (sub-processors) that help us run Tailr:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="font-semibold text-[#1e1813]">Supabase</strong> — authentication and database hosting for your account and content.</li>
            <li><strong className="font-semibold text-[#1e1813]">Anthropic</strong> — AI processing of your CV and job descriptions.</li>
            <li><strong className="font-semibold text-[#1e1813]">Vercel</strong> — application hosting and privacy-friendly analytics.</li>
            <li><strong className="font-semibold text-[#1e1813]">Resend</strong> — sending our transactional and update emails.</li>
          </ul>
          <p>
            Each provider processes data on our behalf under a data processing agreement. Some of them may process
            data outside the UK/EEA; where they do, appropriate safeguards (such as Standard Contractual Clauses) are
            in place. We may also disclose data if required by law.
          </p>
        </Section>

        <Section id="retention" title="5. How long we keep it">
          <p>
            We keep your account and content for as long as your account is active so the service works as you expect.
            You can delete individual items from your history or tracker at any time, and you can ask us to delete your
            account and associated data. We keep limited security logs for a short period, and we may retain minimal
            records where the law requires it.
          </p>
        </Section>

        <Section id="your-rights" title="6. Your rights">
          <p>Under UK and EU data protection law you have the right to:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>access the personal data we hold about you;</li>
            <li>correct data that is inaccurate or incomplete;</li>
            <li>delete your data (the &ldquo;right to be forgotten&rdquo;);</li>
            <li>export your data in a portable format;</li>
            <li>object to or restrict certain processing; and</li>
            <li>withdraw consent for marketing at any time.</li>
          </ul>
          <p>
            To exercise any of these rights, reply to any email you have received from Tailr and we will action your
            request. You also have the right to complain to the UK Information Commissioner&rsquo;s Office (ICO) if you
            believe we have mishandled your data.
          </p>
        </Section>

        <Section id="security" title="7. How we protect it">
          <p>
            Access to your data is protected by authentication, and our database enforces row-level security so that
            you can only access your own records. We use reputable infrastructure providers and encrypt data in transit.
            No system is perfectly secure, but we take reasonable steps to protect your information.
          </p>
        </Section>

        <Section id="cookies" title="8. Cookies and local storage">
          <p>
            We use essential cookies and browser local storage to keep you signed in and to remember your most recent
            CV so you do not have to re-enter it. We use privacy-friendly analytics to measure usage. We do not use
            advertising or cross-site tracking cookies.
          </p>
        </Section>

        <Section id="changes" title="9. Changes to this policy">
          <p>
            We may update this policy as Tailr evolves. When we make material changes, we will update the date at the
            top of this page and, where appropriate, let you know by email.
          </p>
        </Section>

        <Section id="contact" title="10. Contact us">
          <p>
            If you have any questions about this policy or how we handle your data, reply to any email you have
            received from Tailr and we will get back to you.
          </p>
        </Section>

        <div className="mt-14 pt-8 border-t border-gray-100">
          <Link href="/" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#1e1813] hover:opacity-70 transition-opacity">
            <ArrowLeft className="w-4 h-4" />
            Back to Tailr
          </Link>
        </div>
      </main>
    </div>
  )
}
