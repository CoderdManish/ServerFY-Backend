import mongoose from "mongoose";

export const PERMISSIONS = ["analytics", "leads", "requests", "admins", "blog"];

const adminUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
      maxlength: 200,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["owner", "admin", "viewer"], default: "admin", index: true },
    permissions: {
      type: [{ type: String, enum: PERMISSIONS }],
      default: ["analytics", "leads"],
    },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser" },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

adminUserSchema.methods.can = function can(permission) {
  if (this.role === "owner") return true;
  return this.permissions.includes(permission);
};

export const AdminUser =
  mongoose.models.AdminUser ?? mongoose.model("AdminUser", adminUserSchema);
