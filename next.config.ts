import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Cloud Shell's preview proxy host — wildcard covers the hostname
  // changing when the Cloud Shell VM recycles.
  allowedDevOrigins: [
    "3001-cs-132809032525-default.cs-asia-southeast1-yelo.cloudshell.dev",
    "*.cloudshell.dev",
  ],
};

export default nextConfig;
