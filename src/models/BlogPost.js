import mongoose from "mongoose";

const sectionSchema = new mongoose.Schema(
  {
    heading: { type: String, default: "", maxlength: 300 },
    paragraphs: { type: [String], default: [] },
    bullets: { type: [String], default: [] },
  },
  { _id: false },
);

const faqSchema = new mongoose.Schema(
  { q: { type: String, default: "" }, a: { type: String, default: "" } },
  { _id: false },
);

const blogPostSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true, trim: true, maxlength: 200 },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    metaTitle: { type: String, default: "", maxlength: 300 },
    description: { type: String, default: "", maxlength: 500 },
    keywords: { type: String, default: "", maxlength: 600 },
    category: { type: String, default: "SAP Learning", index: true, maxlength: 120 },
    tags: { type: [String], default: [] },
    author: { type: String, default: "ServerFY Team", maxlength: 120 },
    authorRole: { type: String, default: "SAP Server Hosting & Infrastructure", maxlength: 160 },
    date: { type: String, default: () => new Date().toISOString().slice(0, 10) },
    updated: { type: String, default: "" },
    readMinutes: { type: Number, default: 6, min: 1, max: 120 },
    featured: { type: Boolean, default: false },
    excerpt: { type: String, default: "", maxlength: 600 },
    intro: { type: String, default: "", maxlength: 2000 },
    tint: { type: String, enum: ["blue", "orange", "green", "violet"], default: "blue" },
    icon: { type: String, default: "ServerCog", maxlength: 60 },
    cover: { type: String, default: "" },
    coverAlt: { type: String, default: "", maxlength: 400 },
    sections: { type: [sectionSchema], default: [] },
    takeaways: { type: [String], default: [] },
    faq: { type: [faqSchema], default: [] },
    status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
    publishedAt: Date,
    views: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser" },
  },
  { timestamps: true },
);

blogPostSchema.index({ status: 1, date: -1 });

export const BlogPost = mongoose.models.BlogPost ?? mongoose.model("BlogPost", blogPostSchema);
