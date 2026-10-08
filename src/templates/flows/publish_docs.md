---
title: Publish your docs
description: From the first page to a live documentation site.
type: flow
steps:
  - id: write
    page: guide/guide-en
    note: write pages in Markdown
    next: api
  - id: api
    title: Documenting an API?
    note: decision
    next:
      - { to: generator, label: yes }
      - { to: build, label: no }
  - id: generator
    page: page_generator
    next: build
  - id: build
    title: Run rhyla build
    note: static site in dist/
    next:
      - { to: express, label: Express app }
      - { to: static, label: static host }
  - id: express
    page: clients/express-v1
  - id: static
    title: Upload dist/
    note: GitHub Pages, Netlify, Vercel…
---

This is a **flow**: a page that connects other pages into a process. Click a step to open its page. Pages that belong to a flow show where they are in it and link to the previous and next steps.

Flows are defined in the page frontmatter with `type: flow` and a list of `steps`. Open this file (`body/flows/publish_docs.md`) to see how it is written.
