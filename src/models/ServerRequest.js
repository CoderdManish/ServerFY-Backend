import mongoose from "mongoose";

const serverRequestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
    sapModule: { type: String, required: true, trim: true },
    sapVersion: { type: String, required: true, trim: true },
    serverType: { type: String, required: true, trim: true },
    users: { type: String, default: "1" },
    duration: { type: String, default: "1 month" },
    requirement: { type: String, required: true, maxlength: 4000 },
    status: {
      type: String,
      enum: ["new", "contacted", "provisioned", "closed"],
      default: "new",
      index: true,
    },
    meta: {
      ip: String,
      userAgent: String,
    },
  },
  { timestamps: true },
);

export const ServerRequest =
  mongoose.models.ServerRequest ?? mongoose.model("ServerRequest", serverRequestSchema);
