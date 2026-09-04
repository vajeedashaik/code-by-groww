import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // yahoo-finance2 ships its own CJS/ESM and does runtime schema validation;
  // let Next require it at runtime instead of bundling it.
  serverExternalPackages: ["yahoo-finance2"],
};

export default nextConfig;
