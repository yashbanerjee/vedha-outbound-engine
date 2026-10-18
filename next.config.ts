import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  serverExternalPackages: ["@prisma/client", "bcryptjs", "nodemailer", "imapflow", "mailparser"],
};

export default nextConfig;
