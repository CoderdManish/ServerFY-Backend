import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";
import { ensureOwnerAccount } from "./config/bootstrap.js";
import { env } from "./config/env.js";

async function main() {
  await connectDb();
  await ensureOwnerAccount();
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[server] listening on port ${env.port} (${env.nodeEnv})`);
  });
}

main().catch((err) => {
  console.error("[fatal] failed to start server", err);
  process.exit(1);
});
