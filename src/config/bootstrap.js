import bcrypt from "bcryptjs";
import { env } from "./env.js";
import { AdminUser } from "../models/AdminUser.js";

/**
 * Creates the single owner account on first boot when OWNER_EMAIL / OWNER_PASSWORD
 * are set and no admin exists yet. Every other admin is created by the owner
 * from inside the dashboard.
 */
export async function ensureOwnerAccount() {
  const count = await AdminUser.countDocuments({});
  if (count > 0) return;
  if (!env.ownerEmail || env.ownerPassword.length < 10) {
    console.warn("[bootstrap] no admin exists — set OWNER_EMAIL and OWNER_PASSWORD (10+ chars)");
    return;
  }
  await AdminUser.create({
    name: env.ownerName,
    email: env.ownerEmail,
    passwordHash: await bcrypt.hash(env.ownerPassword, 12),
    role: "owner",
    permissions: ["analytics", "leads", "requests", "admins"],
  });
  console.log(`[bootstrap] owner account created for ${env.ownerEmail}`);
}
