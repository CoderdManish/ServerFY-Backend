import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { AdminUser, PERMISSIONS } from "../models/AdminUser.js";
import { requireAuth, requirePermission, signToken } from "../middleware/auth.js";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, message: "Too many attempts. Try again later." },
});

const shape = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  permissions: u.role === "owner" ? PERMISSIONS : u.permissions,
  active: u.active,
  lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt,
});

authRouter.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const parsed = z
      .object({ email: z.string().trim().email(), password: z.string().min(8).max(200) })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, message: "Invalid credentials." });

    const user = await AdminUser.findOne({ email: parsed.data.email.toLowerCase() });
    const ok = user && user.active && (await bcrypt.compare(parsed.data.password, user.passwordHash));
    if (!ok) return res.status(401).json({ ok: false, message: "Invalid email or password." });

    user.lastLoginAt = new Date();
    await user.save();
    return res.json({ ok: true, token: signToken(user), user: shape(user) });
  } catch (err) {
    return next(err);
  }
});

authRouter.get("/me", requireAuth, (req, res) => res.json({ ok: true, user: shape(req.admin) }));

authRouter.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const parsed = z
      .object({ currentPassword: z.string().min(8), newPassword: z.string().min(10).max(200) })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "New password must be at least 10 characters." });
    }
    const match = await bcrypt.compare(parsed.data.currentPassword, req.admin.passwordHash);
    if (!match) return res.status(401).json({ ok: false, message: "Current password is incorrect." });
    req.admin.passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await req.admin.save();
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// ---- Admin user management (permission: admins) ----

authRouter.get("/admins", requireAuth, requirePermission("admins"), async (_req, res, next) => {
  try {
    const items = await AdminUser.find({}).sort({ createdAt: 1 });
    return res.json({ ok: true, items: items.map(shape) });
  } catch (err) {
    return next(err);
  }
});

authRouter.post("/admins", requireAuth, requirePermission("admins"), async (req, res, next) => {
  try {
    const parsed = z
      .object({
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(200),
        password: z.string().min(10).max(200),
        role: z.enum(["admin", "viewer"]).default("admin"),
        permissions: z.array(z.enum(PERMISSIONS)).default(["analytics", "leads"]),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Please check the fields (password needs 10+ characters).",
      });
    }
    const exists = await AdminUser.findOne({ email: parsed.data.email.toLowerCase() });
    if (exists) return res.status(409).json({ ok: false, message: "That email already has access." });

    const user = await AdminUser.create({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
      role: parsed.data.role,
      permissions: parsed.data.permissions,
      createdBy: req.admin._id,
    });
    return res.status(201).json({ ok: true, user: shape(user) });
  } catch (err) {
    return next(err);
  }
});

authRouter.patch("/admins/:id", requireAuth, requirePermission("admins"), async (req, res, next) => {
  try {
    const parsed = z
      .object({
        role: z.enum(["admin", "viewer"]).optional(),
        permissions: z.array(z.enum(PERMISSIONS)).optional(),
        active: z.boolean().optional(),
        password: z.string().min(10).max(200).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, message: "Invalid update." });

    const user = await AdminUser.findById(req.params.id);
    if (!user) return res.status(404).json({ ok: false, message: "Admin not found." });
    if (user.role === "owner") {
      return res.status(403).json({ ok: false, message: "The owner account cannot be changed here." });
    }
    if (parsed.data.role) user.role = parsed.data.role;
    if (parsed.data.permissions) user.permissions = parsed.data.permissions;
    if (typeof parsed.data.active === "boolean") user.active = parsed.data.active;
    if (parsed.data.password) user.passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await user.save();
    return res.json({ ok: true, user: shape(user) });
  } catch (err) {
    return next(err);
  }
});

authRouter.delete("/admins/:id", requireAuth, requirePermission("admins"), async (req, res, next) => {
  try {
    const user = await AdminUser.findById(req.params.id);
    if (!user) return res.status(404).json({ ok: false, message: "Admin not found." });
    if (user.role === "owner") {
      return res.status(403).json({ ok: false, message: "The owner account cannot be removed." });
    }
    await user.deleteOne();
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});
