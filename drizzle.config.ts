import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// `out` is the migrations folder; `drizzle-kit generate` writes SQL here and
// `drizzle-kit migrate` applies any pending files to DATABASE_URL.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
