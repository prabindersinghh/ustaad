/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",            // static HTML export for S3 static hosting
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
