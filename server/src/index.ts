import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";

async function main() {
  // Verify the database is reachable before accepting traffic.
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    console.log("✔ Connected to PostgreSQL.");
  } catch (err) {
    console.error("✖ Could not connect to PostgreSQL. Is it running?");
    console.error(err);
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.PORT, "0.0.0.0", () => {
    console.log(`✔ Maddy Chats API listening on http://0.0.0.0:${env.PORT}`);
    console.log(`  CORS origin: ${env.CLIENT_URL}`);
    console.log(`  Environment: ${env.NODE_ENV}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down…`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main();
