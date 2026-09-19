import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { BlogPost } from "../models/BlogPost.js";
import { BlogCategory } from "../models/BlogCategory.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { parseDocx, slugify } from "../lib/docx-import.js";

export const blogRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const editor = [requireAuth, requirePermission("blog")];

const sectionSchema = z.object({
  heading: z.string().trim().max(300).default(""),
  paragraphs: z.array(z.string().max(6000)).default([]),
  bullets: z.array(z.string().max(2000)).default([]),
});

const postSchema = z.object({
  title: z.string().trim().min(3).max(300),
  slug: z.string().trim().max(200).optional(),
  metaTitle: z.string().trim().max(300).default(""),
  description: z.string().trim().max(500).default(""),
  keywords: z.string().trim().max(600).default(""),
  category: z.string().trim().max(120).default("SAP Learning"),
  tags: z.array(z.string().max(60)).default([]),
  author: z.string().trim().max(120).default("ServerFY Team"),
  authorRole: z.string().trim().max(160).default("SAP Server Hosting & Infrastructure"),
  date: z.string().trim().max(30).optional(),
  updated: z.string().trim().max(30).optional(),
  readMinutes: z.number().int().min(1).max(120).default(6),
  featured: z.boolean().default(false),
  excerpt: z.string().trim().max(600).default(""),
  intro: z.string().trim().max(2000).default(""),
  tint: z.enum(["blue", "orange", "green", "violet"]).default("blue"),
  icon: z.string().trim().max(60).default("ServerCog"),
  cover: z.string().max(2_000_000).default(""),
  coverAlt: z.string().trim().max(400).default(""),
  sections: z.array(sectionSchema).default([]),
  takeaways: z.array(z.string().max(500)).default([]),
  faq: z.array(z.object({ q: z.string().max(400), a: z.string().max(4000) })).default([]),
  status: z.enum(["draft", "published"]).default("draft"),
});

const publicShape = (p) => ({
  slug: p.slug,
  title: p.title,
  metaTitle: p.metaTitle || p.title,
  description: p.description,
  keywords: p.keywords,
  category: p.category,
  tags: p.tags,
  author: p.author,
  authorRole: p.authorRole,
  date: p.date,
  updated: p.updated || undefined,
  readMinutes: p.readMinutes,
  featured: p.featured,
  excerpt: p.excerpt,
  intro: p.intro,
  tint: p.tint,
  icon: p.icon,
  cover: p.cover || undefined,
  coverAlt: p.coverAlt || undefined,
  sections: p.sections.map((s) => ({
    heading: s.heading,
    paragraphs: s.paragraphs,
    ...(s.bullets?.length ? { bullets: s.bullets } : {}),
  })),
  takeaways: p.takeaways,
  faq: p.faq,
});

const adminShape = (p) => ({
  ...publicShape(p),
  id: String(p._id),
  status: p.status,
  views: p.views,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

// ---------- Public ----------

blogRouter.get("/", async (_req, res, next) => {
  try {
    const items = await BlogPost.find({ status: "published" }).sort({ date: -1 });
    const categories = await BlogCategory.find({}).sort({ name: 1 });
    return res.json({
      ok: true,
      items: items.map(publicShape),
      categories: categories.map((c) => c.name),
    });
  } catch (err) {
    return next(err);
  }
});

blogRouter.get("/post/:slug", async (req, res, next) => {
  try {
    const post = await BlogPost.findOne({ slug: req.params.slug, status: "published" });
    if (!post) return res.status(404).json({ ok: false, message: "Article not found." });
    await BlogPost.updateOne({ _id: post._id }, { $inc: { views: 1 } });
    return res.json({ ok: true, post: publicShape(post) });
  } catch (err) {
    return next(err);
  }
});

// ---------- Admin (permission: blog) ----------

blogRouter.get("/admin", editor, async (req, res, next) => {
  try {
    const query = {};
    if (req.query.status) query.status = String(req.query.status);
    if (req.query.category) query.category = String(req.query.category);
    if (req.query.q) {
      const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [{ title: rx }, { slug: rx }, { excerpt: rx }];
    }
    const items = await BlogPost.find(query).sort({ updatedAt: -1 }).limit(300);
    return res.json({ ok: true, items: items.map(adminShape) });
  } catch (err) {
    return next(err);
  }
});

blogRouter.get("/admin/:id", editor, async (req, res, next) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ ok: false, message: "Article not found." });
    return res.json({ ok: true, post: adminShape(post) });
  } catch (err) {
    return next(err);
  }
});

async function uniqueSlug(base, ignoreId) {
  let slug = slugify(base) || "article";
  let n = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await BlogPost.exists({ slug, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) })) {
    slug = `${slugify(base)}-${n++}`;
  }
  return slug;
}

blogRouter.post("/admin", editor, async (req, res, next) => {
  try {
    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Please check the article fields." });
    }
    const data = parsed.data;
    const post = await BlogPost.create({
      ...data,
      slug: await uniqueSlug(data.slug || data.title),
      date: data.date || new Date().toISOString().slice(0, 10),
      publishedAt: data.status === "published" ? new Date() : undefined,
      createdBy: req.admin._id,
      updatedBy: req.admin._id,
    });
    if (data.category) {
      await BlogCategory.updateOne(
        { name: data.category },
        { $setOnInsert: { name: data.category } },
        { upsert: true },
      );
    }
    return res.status(201).json({ ok: true, post: adminShape(post) });
  } catch (err) {
    return next(err);
  }
});

blogRouter.patch("/admin/:id", editor, async (req, res, next) => {
  try {
    const parsed = postSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, message: "Invalid update." });
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ ok: false, message: "Article not found." });

    const data = parsed.data;
    if (data.slug || data.title) {
      post.slug = await uniqueSlug(data.slug || post.slug || data.title, post._id);
    }
    for (const [key, value] of Object.entries(data)) {
      if (key === "slug") continue;
      post[key] = value;
    }
    if (data.status === "published" && !post.publishedAt) post.publishedAt = new Date();
    post.updated = new Date().toISOString().slice(0, 10);
    post.updatedBy = req.admin._id;
    await post.save();
    if (post.category) {
      await BlogCategory.updateOne(
        { name: post.category },
        { $setOnInsert: { name: post.category } },
        { upsert: true },
      );
    }
    return res.json({ ok: true, post: adminShape(post) });
  } catch (err) {
    return next(err);
  }
});

blogRouter.post("/admin/:id/duplicate", editor, async (req, res, next) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ ok: false, message: "Article not found." });
    const copy = post.toObject();
    delete copy._id;
    delete copy.createdAt;
    delete copy.updatedAt;
    const created = await BlogPost.create({
      ...copy,
      title: `${post.title} (copy)`,
      slug: await uniqueSlug(`${post.slug}-copy`),
      status: "draft",
      featured: false,
      views: 0,
      publishedAt: undefined,
      createdBy: req.admin._id,
    });
    return res.status(201).json({ ok: true, post: adminShape(created) });
  } catch (err) {
    return next(err);
  }
});

blogRouter.delete("/admin/:id", editor, async (req, res, next) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ ok: false, message: "Article not found." });
    await post.deleteOne();
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// ---------- Categories ----------

blogRouter.get("/categories", editor, async (_req, res, next) => {
  try {
    const items = await BlogCategory.find({}).sort({ name: 1 });
    return res.json({ ok: true, items: items.map((c) => ({ id: String(c._id), name: c.name })) });
  } catch (err) {
    return next(err);
  }
});

blogRouter.post("/categories", editor, async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? "").trim().slice(0, 120);
    if (name.length < 2) return res.status(400).json({ ok: false, message: "Name is too short." });
    const exists = await BlogCategory.findOne({ name });
    if (exists) return res.status(409).json({ ok: false, message: "That category already exists." });
    const cat = await BlogCategory.create({ name });
    return res.status(201).json({ ok: true, category: { id: String(cat._id), name: cat.name } });
  } catch (err) {
    return next(err);
  }
});

blogRouter.patch("/categories/:id", editor, async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? "").trim().slice(0, 120);
    if (name.length < 2) return res.status(400).json({ ok: false, message: "Name is too short." });
    const cat = await BlogCategory.findById(req.params.id);
    if (!cat) return res.status(404).json({ ok: false, message: "Category not found." });
    const old = cat.name;
    cat.name = name;
    await cat.save();
    await BlogPost.updateMany({ category: old }, { $set: { category: name } });
    return res.json({ ok: true, category: { id: String(cat._id), name: cat.name } });
  } catch (err) {
    return next(err);
  }
});

blogRouter.delete("/categories/:id", editor, async (req, res, next) => {
  try {
    const cat = await BlogCategory.findById(req.params.id);
    if (!cat) return res.status(404).json({ ok: false, message: "Category not found." });
    const inUse = await BlogPost.exists({ category: cat.name });
    if (inUse) {
      return res.status(409).json({ ok: false, message: "Some articles still use this category." });
    }
    await cat.deleteOne();
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// ---------- Word import ----------

blogRouter.post("/import-docx", editor, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: "Please choose a file." });
    if (!/\.docx$/i.test(req.file.originalname)) {
      return res.status(400).json({ ok: false, message: "Only .docx files are supported." });
    }
    const draft = await parseDocx(req.file.buffer);
    return res.json({ ok: true, draft });
  } catch (err) {
    return next(err);
  }
});
