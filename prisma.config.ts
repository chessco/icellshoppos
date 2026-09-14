import { defineConfig } from "prisma/config";
import { config as loadEnv } from "dotenv";

loadEnv();
loadEnv({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
});
