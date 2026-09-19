import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { Lead } from "../models/Lead.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";

export const leadsRouter = Router();

const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, message: "Too many submissions. Please try again later." },
});

const leadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(8).max(40),
  interest: z.string().trim().max(160).optional().default(""),
  location: z.string().trim().max(160).optional().default(""),
  message: z.string().trim().max(2000).optional().default(""),
  source: z.string().trim().max(60).optional().default("popup"),
  page: z.string().trim().max(400).optional().default(""),
  referrer: z.string().trim().max(500).optional().default(""),
  visitorId: z.string().trim().max(64).optional(),
  device: z.string().trim().max(20).optional(),
  consent: z.boolean().optional(),
  company_website: z.string().max(0).optional(), // honeypot
});

// Public — the site's lead popup posts here.
leadsRouter.post("/", submitLimiter, async (req, res, next) => {
  try {
    const parsed = leadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "Please check the form fields.",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const { company_website: _hp, consent: _c, device, ...data } = parsed.data;
    const doc = await Lead.create({
      ...data,
      meta: {
        ip: req.ip,
        userAgent: (req.header("user-agent") ?? "").slice(0, 500),
        country: req.header("cf-ipcountry") ?? req.header("x-vercel-ip-country") ?? undefined,
        city: req.header("x-vercel-ip-city") ?? undefined,
        device,
      },
    });
    return res.status(201).json({ ok: true, id: doc._id });
  } catch (err) {
    return next(err);
  }
});

// ---- Admin reporting ----

leadsRouter.get("/", requireAuth, requirePermission("leads"), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const filter = {};
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.q) {
      const rx = new RegExp(String(req.query.q).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { interest: rx }, { location: rx }];
    }
    const items = await Lead.find(filter).sort({ createdAt: -1 }).limit(limit).select("-meta.ip").lean();
    return res.json({ ok: true, count: items.length, items });
  } catch (err) {
    return next(err);
  }
});

leadsRouter.patch("/:id", requireAuth, requirePermission("leads"), async (req, res, next) => {
  try {
    const parsed = z
      .object({
        status: z.enum(["new", "contacted", "qualified", "converted", "lost"]).optional(),
        notes: z.string().trim().max(2000).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, message: "Invalid update." });
    const lead = await Lead.findByIdAndUpdate(req.params.id, parsed.data, { new: true }).lean();
    if (!lead) return res.status(404).json({ ok: false, message: "Lead not found." });
    return res.json({ ok: true, lead });
  } catch (err) {
    return next(err);
  }
});

const RANGES = {
  day: { buckets: 24, unit: "hour", ms: 60 * 60 * 1000, format: "%H:00" },
  week: { buckets: 7, unit: "day", ms: 24 * 60 * 60 * 1000, format: "%d %b" },
  month: { buckets: 30, unit: "day", ms: 24 * 60 * 60 * 1000, format: "%d %b" },
  year: { buckets: 12, unit: "month", ms: 0, format: "%b %Y" },
};

function startOf(unit, date) {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  if (unit === "hour") return d;
  d.setUTCHours(0, 0, 0, 0);
  if (unit === "day") return d;
  d.setUTCDate(1);
  return d;
}

function shift(unit, date, amount) {
  const d = new Date(date);
  if (unit === "hour") d.setUTCHours(d.getUTCHours() + amount);
  else if (unit === "day") d.setUTCDate(d.getUTCDate() + amount);
  else d.setUTCMonth(d.getUTCMonth() + amount);
  return d;
}

/** Lead volume for the current period plus the previous period, bucketed for charting. */
leadsRouter.get("/stats", requireAuth, requirePermission("leads"), async (req, res, next) => {
  try {
    const rangeKey = RANGES[String(req.query.range ?? "week")] ? String(req.query.range ?? "week") : "week";
    const { buckets, unit } = RANGES[rangeKey];

    const end = shift(unit, startOf(unit, new Date()), 1); // exclusive end of current bucket
    const currentStart = shift(unit, end, -buckets);
    const previousStart = shift(unit, currentStart, -buckets);

    const rows = await Lead.aggregate([
      { $match: { createdAt: { $gte: previousStart, $lt: end } } },
      {
        $group: {
          _id: { $dateTrunc: { date: "$createdAt", unit } },
          count: { $sum: 1 },
        },
      },
    ]);
    const byBucket = new Map(rows.map((r) => [new Date(r._id).toISOString(), r.count]));

    const series = [];
    for (let i = 0; i < buckets; i += 1) {
      const cur = shift(unit, currentStart, i);
      const prev = shift(unit, previousStart, i);
      series.push({
        at: cur.toISOString(),
        current: byBucket.get(cur.toISOString()) ?? 0,
        previous: byBucket.get(prev.toISOString()) ?? 0,
      });
    }

    const [statuses, sources, totalAll] = await Promise.all([
      Lead.aggregate([
        { $match: { createdAt: { $gte: currentStart, $lt: end } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Lead.aggregate([
        { $match: { createdAt: { $gte: currentStart, $lt: end } } },
        { $group: { _id: "$source", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      Lead.countDocuments({}),
    ]);

    const current = series.reduce((s, p) => s + p.current, 0);
    const previous = series.reduce((s, p) => s + p.previous, 0);

    return res.json({
      ok: true,
      range: rangeKey,
      unit,
      series,
      totals: {
        current,
        previous,
        changePct: previous ? Math.round(((current - previous) / previous) * 100) : null,
        allTime: totalAll,
      },
      statuses: statuses.map((s) => ({ status: s._id ?? "new", count: s.count })),
      sources: sources.map((s) => ({ source: s._id ?? "popup", count: s.count })),
    });
  } catch (err) {
    return next(err);
  }
});
