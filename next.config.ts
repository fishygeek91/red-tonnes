import type { NextConfig } from "next";

/**
 * GITHUB_PAGES is set by the deploy workflow. It switches the build to a
 * fully static export served under the repository subpath
 * (https://fishygeek91.github.io/red-tonnes), while `next dev` and plain
 * `next build` keep working at the domain root.
 */
const isGitHubPages: boolean = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  ...(isGitHubPages
    ? {
        output: "export",
        basePath: "/red-tonnes",
      }
    : {}),
};

export default nextConfig;
