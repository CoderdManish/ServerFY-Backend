import mongoose from "mongoose";

const blogCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 120 },
  },
  { timestamps: true },
);

export const BlogCategory =
  mongoose.models.BlogCategory ?? mongoose.model("BlogCategory", blogCategorySchema);
