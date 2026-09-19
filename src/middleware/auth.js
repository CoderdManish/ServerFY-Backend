import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AdminUser } from "../models/AdminUser.js";

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, env.jwtSecret, {
    expiresIn: "12h",
  });
}

/** Verifies the Bearer token and attaches the live admin document to req.admin. */
export async function requireAuth(req, res, next) {
  try {
    const header = req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, message: "Sign in required." });

    const payload = jwt.verify(token, env.jwtSecret);
    const user = await AdminUser.findById(payload.sub);
    if (!user || !user.active) {
      return res.status(401).json({ ok: false, message: "Account is not active." });
    }
    req.admin = user;
    return next();
  } catch {
    return res.status(401).json({ ok: false, message: "Session expired. Please sign in again." });
  }
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.admin?.can(permission)) {
      return res.status(403).json({ ok: false, message: "You do not have access to this area." });
    }
    return next();
  };
}
