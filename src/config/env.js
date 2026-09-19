import "dotenv/config";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 8000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  mongoUri: required("MONGODB_URI"),
  mongoDb: process.env.MONGODB_DB ?? "serverfy",
  jwtSecret: required("JWT_SECRET"),
  ownerEmail: (process.env.OWNER_EMAIL ?? "").trim().toLowerCase(),
  ownerPassword: process.env.OWNER_PASSWORD ?? "",
  ownerName: process.env.OWNER_NAME ?? "ServerFY Owner",
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:8080")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
};
