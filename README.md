# nextghq.github.io

The NextG Systems blog, built with [Eleventy](https://www.11ty.dev/) and
deployed to GitHub Pages by GitHub Actions on every push to `main`.

## Local preview

```sh
npm install
npm start        # serves at http://localhost:8080 with live reload
```

## Writing a post

Add a Markdown file to `src/posts/` named `YYYY-MM-DD-slug.md`:

```markdown
---
title: "Post title"
date: 2026-10-07
series: "Building NextG Systems"   # optional
excerpt: "One or two sentences for the index page and link previews."
---

Post body in Markdown.
```

The post appears at `/blog/<slug>/` and in the Atom feed at `/feed.xml`.

## One-time setup

In the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
