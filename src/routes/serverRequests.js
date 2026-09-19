import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { ServerRequest } from "../models/ServerRequest.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";

export const serverRequestsRouter = Router();

const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, message: "Too many requests. Please try again later." },
});

const payloadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(8).max(40),
  sapModule: z.string().trim().min(1).max(120),
  sapVersion: z.string().trim().min(1).max(120),
  serverType: z.string().trim().min(1).max(120),
  users: z.string().trim().max(40).default("1"),
  duration: z.string().trim().max(60).default("1 month"),
  requirement: z.string().trim().min(10).max(4000),
  // honeypot: must stay empty
  company_website: z.string().max(0).optional(),
});

serverRequestsRouter.post("/", submitLimiter, async (req, res, next) => {
  try {
    const parsed = payloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Please check the form fields.",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const { company_website: _hp, ...data } = parsed.data;
    const doc = await ServerRequest.create({
      ...data,
      meta: { ip: req.ip, userAgent: req.header("user-agent") ?? "" },
    });
    return res.status(201).json({ ok: true, id: doc._id });
  } catch (err) {
    return next(err);
  }
});

serverRequestsRouter.get("/", requireAuth, requirePermission("requests"), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const items = await ServerRequest.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("-meta.ip")
      .lean();
    return res.json({ ok: true, count: items.length, items });
  } catch (err) {
    return next(err);
  }
});
