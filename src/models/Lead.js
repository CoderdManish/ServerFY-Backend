import mongoose from "mongoose";

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, index: true, maxlength: 200 },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
    interest: { type: String, trim: true, maxlength: 160, default: "" },
    location: { type: String, trim: true, maxlength: 160, default: "" },
    message: { type: String, trim: true, maxlength: 2000, default: "" },
    source: { type: String, trim: true, maxlength: 60, default: "popup", index: true },
    page: { type: String, trim: true, maxlength: 400, default: "" },
    referrer: { type: String, trim: true, maxlength: 500, default: "" },
    visitorId: { type: String, trim: true, maxlength: 64, index: true },
    status: {
      type: String,
      enum: ["new", "contacted", "qualified", "converted", "lost"],
      default: "new",
      index: true,
    },
    notes: { type: String, trim: true, maxlength: 2000, default: "" },
    meta: { ip: String, userAgent: String, country: String, city: String, device: String },
  },
  { timestamps: true },
);

leadSchema.index({ createdAt: -1 });

export const Lead = mongoose.models.Lead ?? mongoose.model("Lead", leadSchema);
