/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",          // static export — served by app/server.js under /ui
  basePath: "/ui",
  trailingSlash: true,       // folder/index.html layout for the zero-dep server
  images: { unoptimized: true },
};

export default nextConfig;
