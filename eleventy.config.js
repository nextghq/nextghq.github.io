import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import markdownItAnchor from "markdown-it-anchor";
import topics from "./src/_data/topics.js";

// Posts with `draft: true` are left out of the build entirely.
// Preview them locally with: ELEVENTY_DRAFTS=1 npm start
const showDrafts = Boolean(process.env.ELEVENTY_DRAFTS);

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(syntaxHighlight);
  eleventyConfig.amendLibrary("md", (md) =>
    md.use(markdownItAnchor, {
      level: [2, 3],
      permalink: markdownItAnchor.permalink.headerLink({ safariReaderFix: true }),
    })
  );

  eleventyConfig.addPreprocessor("drafts", "*", (data) => {
    if (data.draft && !showDrafts) return false;
  });

  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });

  const topicBySlug = Object.fromEntries(topics.map((t) => [t.slug, t]));

  eleventyConfig.addCollection("posts", (api) => {
    const posts = api.getFilteredByGlob("src/posts/*.md").reverse();
    for (const p of posts) {
      if (!topicBySlug[p.data.topic]) {
        throw new Error(
          `${p.inputPath}: topic "${p.data.topic}" is not one of: ${Object.keys(topicBySlug).join(", ")} (see src/_data/topics.js)`
        );
      }
    }
    return posts;
  });

  eleventyConfig.addFilter("byTopic", (posts, slug) => posts.filter((p) => p.data.topic === slug));
  eleventyConfig.addFilter("topicInfo", (slug) => topicBySlug[slug]);

  eleventyConfig.addFilter("readableDate", (date) =>
    new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    })
  );
  eleventyConfig.addFilter("isoDate", (date) =>
    new Date(date).toISOString().slice(0, 10)
  );
  eleventyConfig.addFilter("readingTime", (content) => {
    const words = String(content).replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 230)) + " min read";
  });

  eleventyConfig.addPlugin(feedPlugin, {
    type: "atom",
    outputPath: "/feed.xml",
    collection: { name: "posts", limit: 20 },
    metadata: {
      language: "en",
      title: "NextG Systems",
      subtitle:
        "Notes from NextG Systems LLC on building open, programmable, and secure systems, in software-defined wireless and AI infrastructure.",
      base: "https://nextghq.github.io/",
      author: { name: "NextG Systems LLC" },
    },
  });

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
