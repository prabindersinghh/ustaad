/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",            // static HTML export for S3 static hosting
  images: { unoptimized: true },
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
};

export default nextConfig;
