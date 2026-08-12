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
    ]
  },
}

module.exports = nextConfig
