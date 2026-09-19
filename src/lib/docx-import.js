import mammoth from "mammoth";

const decode = (s) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/** Keeps <a href> links, drops every other tag. */
function inline(html) {
  return decode(
    html
      .replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
        const text = label.replace(/<[^>]+>/g, "").trim();
        return text ? `<a href="${href}">${text}</a>` : "";
      })
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<(?!\/?a\b)[^>]+>/gi, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 90);
}

const FAQ_HEADING = /^(faqs?|frequently asked questions)\b/i;

/** Converts a .docx buffer into the blog post shape used by the site. */
export async function parseDocx(buffer) {
  const { value: html } = await mammoth.convertToHtml({ buffer });

  const blocks = [];
  const re = /<(h[1-6]|p|ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const body = m[2];
    if (tag === "ul" || tag === "ol") {
      const items = [...body.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
        .map((li) => inline(li[1]))
        .filter(Boolean);
      if (items.length) blocks.push({ type: "list", items });
    } else if (tag === "p") {
      const text = inline(body);
      if (text) blocks.push({ type: "p", text });
    } else {
      const text = inline(body);
      if (text) blocks.push({ type: "h", level: Number(tag[1]), text });
    }
  }

  let title = "";
  let intro = "";
  const sections = [];
  const faq = [];
  const takeaways = [];
  let inFaq = false;
  let current = null;

  const push = () => {
    if (current && (current.paragraphs.length || current.bullets.length)) sections.push(current);
    current = null;
  };

  for (const block of blocks) {
    if (block.type === "h") {
      if (!title) {
        title = block.text;
        continue;
      }
      push();
      if (FAQ_HEADING.test(block.text)) {
        inFaq = true;
        continue;
      }
      if (inFaq) {
        faq.push({ q: block.text, a: "" });
        continue;
      }
      current = { heading: block.text, paragraphs: [], bullets: [] };
      continue;
    }

    if (inFaq && faq.length) {
      const last = faq[faq.length - 1];
      const text = block.type === "list" ? block.items.join(" ") : block.text;
      last.a = last.a ? `${last.a} ${text}` : text;
      continue;
    }

    if (!current) {
      if (block.type === "p") intro = intro ? `${intro} ${block.text}` : block.text;
      continue;
    }

    if (block.type === "list") current.bullets.push(...block.items);
    else current.paragraphs.push(block.text);
  }
  push();

  const plain = (s) => s.replace(/<[^>]+>/g, "");
  const words = [intro, ...sections.flatMap((s) => [...s.paragraphs, ...s.bullets])]
    .map(plain)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;

  const firstSection = sections[0];
  if (firstSection?.bullets.length && /key takeaway|summary/i.test(firstSection.heading)) {
    takeaways.push(...firstSection.bullets);
  }

  return {
    title: title || "Untitled article",
    slug: slugify(title || "untitled-article"),
    intro,
    excerpt: plain(intro).slice(0, 260),
    description: plain(intro).slice(0, 155),
    metaTitle: (title || "Untitled article").slice(0, 60),
    sections: sections.map((s) => ({
      heading: s.heading,
      paragraphs: s.paragraphs,
      bullets: s.bullets,
    })),
    faq: faq.filter((f) => f.q && f.a),
    takeaways,
    readMinutes: Math.max(3, Math.round(words / 220)),
  };
}
