/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pin the workspace root to this project (a stray lockfile in $HOME otherwise
  // makes Next infer the wrong root).
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
