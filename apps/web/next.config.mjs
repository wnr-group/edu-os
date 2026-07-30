import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@erp/shared", "@erp/ui"],
  allowedDevOrigins: ["lvh.me", "*.lvh.me", "school1.lvh.me", "core.lvh.me", "meow.lvh.me"],
  images: {
    formats: ["image/avif", "image/webp"],
  },
  turbopack: {
    root: path.resolve(__dirname, "../../"),
  },
};

export default nextConfig;
