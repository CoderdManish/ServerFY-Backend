import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { AnalyticsEvent } from "../models/AnalyticsEvent.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";

export const analyticsRouter = Router();

const collectLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120, // batched beacons, generous but bounded per IP
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, message: "Too many events." },
});

const str = (max) => z.string().trim().max(max).optional();

const eventSchema = z.object({
  type: z.enum(["pageview", "pageleave", "click", "scroll", "event", "session_start"]),
  name: str(120),
  path: str(400),
  title: str(300),
  referrer: str(500),
  entryPath: str(400),
  durationMs: z.number().int().min(0).max(1000 * 60 * 60 * 6).optional(),
  scrollDepth: z.number().int().min(0).max(100).optional(),
  target: z
    .object({ tag: str(30), text: str(160), id: str(120), href: str(400), label: str(160) })
    .optional(),
  props: z.record(z.union([z.string().max(300), z.number(), z.boolean()])).optional(),
  occurredAt: z.number().int().optional(),
});

const payloadSchema = z.object({
  visitorId: z.string().trim().min(8).max(64),
  sessionId: z.string().trim().min(8).max(64),
  isReturning: z.boolean().optional(),
  device: z
    .object({
      type: z.enum(["mobile", "tablet", "desktop"]).optional(),
      screen: str(20),
      viewport: str(20),
      language: str(20),
      timezone: str(60),
    })
    .optional(),
  events: z.array(eventSchema).min(1).max(50),
});

function geoFromHeaders(req) {
  const pick = (...names) => {
    for (const n of names) {
      const v = req.header(n);
      if (v) return String(v).slice(0, 80);
    }
    return undefined;
  };
  return {
    country: pick("cf-ipcountry", "x-vercel-ip-country", "x-country-code"),
    region: pick("x-vercel-ip-country-region", "cf-region"),
    city: pick("x-vercel-ip-city", "cf-ipcity"),
  };
}

// Public, no login required — anonymous visitor telemetry.
analyticsRouter.post("/collect", collectLimiter, async (req, res, next) => {
  try {
    const parsed = payloadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, message: "Invalid payload" });

    const { visitorId, sessionId, isReturning, device, events } = parsed.data;
    const geo = geoFromHeaders(req);
    const ua = (req.header("user-agent") ?? "").slice(0, 500);

    const docs = events.map((e) => ({
      ...e,
      occurredAt: e.occurredAt ? new Date(e.occurredAt) : new Date(),
      visitorId,
      sessionId,
      isReturning: Boolean(isReturning),
      device,
      geo,
      ua,
    }));

    await AnalyticsEvent.insertMany(docs, { ordered: false });
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
});

// Admin-only reporting.
analyticsRouter.get("/summary", requireAuth, requirePermission("analytics"), async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days ?? 7), 1), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const match = { occurredAt: { $gte: since } };

    const [totals, topPages, referrers, devices, countries, topEvents, topClicks] =
      await Promise.all([
        AnalyticsEvent.aggregate([
          { $match: match },
          {
            $group: {
              _id: null,
              visitors: { $addToSet: "$visitorId" },
              sessions: { $addToSet: "$sessionId" },
              pageviews: { $sum: { $cond: [{ $eq: ["$type", "pageview"] }, 1, 0] } },
              timeOnPageMs: { $sum: { $ifNull: ["$durationMs", 0] } },
              returning: { $addToSet: { $cond: ["$isReturning", "$visitorId", "$$REMOVE"] } },
            },
          },
          {
            $project: {
              _id: 0,
              visitors: { $size: "$visitors" },
              sessions: { $size: "$sessions" },
              returningVisitors: { $size: "$returning" },
              pageviews: 1,
              timeOnPageMs: 1,
            },
          },
        ]),
        AnalyticsEvent.aggregate([
          { $match: { ...match, type: "pageview" } },
          { $group: { _id: "$path", views: { $sum: 1 }, visitors: { $addToSet: "$visitorId" } } },
          { $project: { path: "$_id", _id: 0, views: 1, visitors: { $size: "$visitors" } } },
          { $sort: { views: -1 } },
          { $limit: 20 },
        ]),
        AnalyticsEvent.aggregate([
          { $match: { ...match, type: "session_start" } },
          { $group: { _id: { $ifNull: ["$referrer", "direct"] }, sessions: { $sum: 1 } } },
          { $project: { referrer: "$_id", _id: 0, sessions: 1 } },
          { $sort: { sessions: -1 } },
          { $limit: 20 },
        ]),
        AnalyticsEvent.aggregate([
          { $match: match },
          { $group: { _id: "$device.type", visitors: { $addToSet: "$visitorId" } } },
          { $project: { device: "$_id", _id: 0, visitors: { $size: "$visitors" } } },
        ]),
        AnalyticsEvent.aggregate([
          { $match: match },
          { $group: { _id: "$geo.country", visitors: { $addToSet: "$visitorId" } } },
          { $project: { country: "$_id", _id: 0, visitors: { $size: "$visitors" } } },
          { $sort: { visitors: -1 } },
          { $limit: 20 },
        ]),
        AnalyticsEvent.aggregate([
          { $match: { ...match, type: "event" } },
          { $group: { _id: "$name", count: { $sum: 1 } } },
          { $project: { name: "$_id", _id: 0, count: 1 } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ]),
        AnalyticsEvent.aggregate([
          { $match: { ...match, type: "click" } },
          { $group: { _id: { $ifNull: ["$target.label", "$target.text"] }, count: { $sum: 1 } } },
          { $project: { label: "$_id", _id: 0, count: 1 } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ]),
      ]);

    return res.json({
      ok: true,
      days,
      totals: totals[0] ?? { visitors: 0, sessions: 0, pageviews: 0, timeOnPageMs: 0, returningVisitors: 0 },
      topPages,
      referrers,
      devices,
      countries,
      topEvents,
      topClicks,
    });
  } catch (err) {
    return next(err);
  }
});

// Full event stream for one anonymous visitor (session replay of the journey).
analyticsRouter.get("/visitors/:visitorId", requireAuth, requirePermission("analytics"), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 200), 1000);
    const items = await AnalyticsEvent.find({ visitorId: req.params.visitorId })
      .sort({ occurredAt: 1 })
      .limit(limit)
      .lean();
    return res.json({ ok: true, count: items.length, items });
  } catch (err) {
    return next(err);
  }
});

// Visitor volume for the current period vs the previous one, bucketed for charts.
const TS_RANGES = { day: { buckets: 24, unit: "hour" }, week: { buckets: 7, unit: "day" }, month: { buckets: 30, unit: "day" }, year: { buckets: 12, unit: "month" } };

function tsStartOf(unit, date) {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  if (unit === "hour") return d;
  d.setUTCHours(0, 0, 0, 0);
  if (unit === "day") return d;
  d.setUTCDate(1);
  return d;
}

function tsShift(unit, date, amount) {
  const d = new Date(date);
  if (unit === "hour") d.setUTCHours(d.getUTCHours() + amount);
  else if (unit === "day") d.setUTCDate(d.getUTCDate() + amount);
  else d.setUTCMonth(d.getUTCMonth() + amount);
  return d;
}

analyticsRouter.get("/timeseries", requireAuth, requirePermission("analytics"), async (req, res, next) => {
  try {
    const key = TS_RANGES[String(req.query.range ?? "week")] ? String(req.query.range ?? "week") : "week";
    const { buckets, unit } = TS_RANGES[key];
    const end = tsShift(unit, tsStartOf(unit, new Date()), 1);
    const currentStart = tsShift(unit, end, -buckets);
    const previousStart = tsShift(unit, currentStart, -buckets);

    const rows = await AnalyticsEvent.aggregate([
      { $match: { occurredAt: { $gte: previousStart, $lt: end } } },
      {
        $group: {
          _id: { $dateTrunc: { date: "$occurredAt", unit } },
          visitors: { $addToSet: "$visitorId" },
          pageviews: { $sum: { $cond: [{ $eq: ["$type", "pageview"] }, 1, 0] } },
        },
      },
      { $project: { visitors: { $size: "$visitors" }, pageviews: 1 } },
    ]);
    const byBucket = new Map(rows.map((r) => [new Date(r._id).toISOString(), r]));

    const series = [];
    for (let i = 0; i < buckets; i += 1) {
      const cur = tsShift(unit, currentStart, i).toISOString();
      const prev = tsShift(unit, previousStart, i).toISOString();
      series.push({
        at: cur,
        current: byBucket.get(cur)?.visitors ?? 0,
        previous: byBucket.get(prev)?.visitors ?? 0,
        pageviews: byBucket.get(cur)?.pageviews ?? 0,
      });
    }
    const current = series.reduce((s, p) => s + p.current, 0);
    const previous = series.reduce((s, p) => s + p.previous, 0);
    return res.json({
      ok: true,
      range: key,
      unit,
      series,
      totals: { current, previous, changePct: previous ? Math.round(((current - previous) / previous) * 100) : null },
    });
  } catch (err) {
    return next(err);
  }
});
