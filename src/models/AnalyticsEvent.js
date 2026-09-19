import mongoose from "mongoose";

const analyticsEventSchema = new mongoose.Schema(
  {
    visitorId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: ["pageview", "pageleave", "click", "scroll", "event", "session_start"],
      index: true,
    },
    name: { type: String, trim: true, maxlength: 120 },
    path: { type: String, trim: true, maxlength: 400, index: true },
    title: { type: String, trim: true, maxlength: 300 },
    referrer: { type: String, trim: true, maxlength: 500 },
    entryPath: { type: String, trim: true, maxlength: 400 },
    // pageleave
    durationMs: { type: Number, min: 0, max: 1000 * 60 * 60 * 6 },
    scrollDepth: { type: Number, min: 0, max: 100 },
    // click
    target: {
      tag: String,
      text: String,
      id: String,
      href: String,
      label: String,
    },
    props: { type: mongoose.Schema.Types.Mixed },
    isReturning: { type: Boolean, default: false },
    device: {
      type: { type: String }, // mobile | tablet | desktop
      screen: String,
      viewport: String,
      language: String,
      timezone: String,
    },
    geo: {
      country: String,
      region: String,
      city: String,
    },
    ua: { type: String, maxlength: 500 },
    occurredAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

// Auto-expire raw events after 180 days to keep the collection small.
analyticsEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export const AnalyticsEvent =
  mongoose.models.AnalyticsEvent ?? mongoose.model("AnalyticsEvent", analyticsEventSchema);
