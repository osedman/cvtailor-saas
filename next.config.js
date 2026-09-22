// NOTE: this .js file shadows next.config.mjs (Next picks .js first), so it
// must carry the real config. Critically, turbopack.root pins the workspace to
// this project — without it Next roots at ~ (stray ~/package-lock.json) and
// Turbopack scans the entire home directory, making dev start take ~10 minutes.
/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: __dirname,
  },
  async redirects() {
    return [
      // /walkthrough was deleted on 12 Aug 2026. Win-back emails already in
      // people's inboxes link to it, and those cannot be edited — without this
      // they would 404 forever. Send them to the home page instead.
      { source: '/walkthrough', destination: '/', permanent: true },
      // The client-brief flow was removed (22 Sep 2026). "New brief" emails
      // already delivered link to the inbox, so it redirects rather than 404s.
      // Not permanent: the business may want briefs back.
      { source: '/agencies/briefs', destination: '/agencies', permanent: false },
      { source: '/hiring/briefs/new', destination: '/hiring', permanent: false },
      // The hiring manager's five places became three (22 Sep 2026, Figma
      // frame 23). The cross-role phase lists are stages inside each role
      // now; old links land on the place that answers the same question.
      { source: '/hiring/shortlist', destination: '/hiring/roles', permanent: false },
      { source: '/hiring/decisions', destination: '/hiring/roles', permanent: false },
      { source: '/hiring/interviews', destination: '/hiring/diary', permanent: false },
    ]
  },
}

module.exports = nextConfig
