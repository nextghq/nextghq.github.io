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
topic: wireless                     # required: wireless or ai-infra (see below)
description: "One or two sentences for the index page and link previews."
author: Dan Mihai Dumitriu          # optional
tags: [OCUDU, SDR]                  # optional, shown above the title
series: "Building NextG Systems"   # optional, shown instead of tags
draft: true                         # optional, leaves the post out of the build
---

Post body in Markdown.
```

The post appears at `/blog/<slug>/` and in the Atom feed at `/feed.xml`.

## Topics

Every post has one `topic`. The home page has filter links for each topic, and each
topic gets its own page at `/topics/<slug>/`. Topics are defined in
`src/_data/topics.js`. Add an entry there (slug, name, one-line blurb) to create a
new one. The build fails if a post names a topic that isn't in that file.

## Drafts

Drafts (`draft: true`) are not built or published. To preview them locally:

```sh
ELEVENTY_DRAFTS=1 npm start
```

Posts can use these HTML components inside the Markdown: `<div class="stats">` with
`<div class="stat"><b>…</b><span>…</span></div>` tiles, `<div class="callout">`,
`<div class="table-wrap">` around wide tables, and `<figure class="diagram">` with
inline SVG using the `dg-*` classes.

## One-time setup

In the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
