# API Page Generator

A lightweight tool to create consistent REST API documentation pages faster. Fill a form, preview the markdown, and generate a ready-to-serve page.

This page explains what each field does and how the generator creates the final file.

## TL;DR

- Use Route Path for display and cURL only (what readers see).
- Use Document Path for the file location (where the .md file is saved).
- Pick the HTTP method and optional tags (new, dep, v1, v2, …).
- Write headers, query params, and body (JSON).
- Optionally, use the Body Fields editor to structure the body (JSON ⇆ table).
- Click Generate Page to create the markdown file.

Open the generator at: `/body/kit_dev_rhyla/new_rote.html`

---

## Key concepts

### Route Path (visual)
- Displays in the page and cURL preview.
- Does not affect where the file is saved.
- Example: `/api/users` will show as the endpoint path in the docs and cURL.

### Document Path (where to save)
- Controls the output path under `rhyla-docs/body`.
- The last segment becomes the file name base (spaces → `_`).
- Missing folders are created automatically.
- Don’t include an extension (no `.md` / `.html`).

Example mapping:
- Document Path: `/api/users`
- HTTP Method: `POST`
- Tags: `new`, `v1`
- Result file: `/api/post-users-new.md`

Notes:
- The method is a filename prefix (lowercase): `get-`, `post-`, `put-`, `delete-`, `patch-`.
- Tags are appended as suffixes: `-new`, `-dep`, `-v1`, `-v2`, `-v1.0.0`, …

---

## HTTP method and tags
- Select one method: GET, POST, PUT, DELETE, PATCH.
- Select an optional tag (radio buttons):
  - new: recently added
  - dep: deprecated
  - v1, v2, v3, …: versions
- In the preview/markdown, tags are rendered as plain text like: `POST [new] [v1]`.
- In the file name, tags are appended as suffixes as shown above.

---

## Request section

### Headers
- Paste one per line in the format: `Header-Name: value`.
- Example:
  - `Content-Type: application/json`
  - `Authorization: Bearer {token}`

### URL Parameters
- Write one per line with a short description.
- Example:
  - `page: page number (optional)`
  - `limit: items per page (optional)`

### Body (JSON)
- Write a JSON body directly.
- Or use the Body Fields editor for a structured approach:
  - Parse JSON to Fields: reads the JSON and creates rows (supports nested keys via dot notation like `address.street`).
  - Add Field: inserts a new row.
  - Editable columns: Field | Type | Required | Description | Example
  - Bi-directional sync: editing the table updates the JSON, and parsing JSON updates the table.
  - The generated page includes a “Body Fields” markdown table for quick reference.

Supported types: `string`, `number`, `boolean`, `object`, `array`, `null`.

---

## Responses

- Success (200): paste a JSON example (shown as a code block).
- Errors: list status + example blocks:

```
400 Bad Request:
{
  "error": "Validation error",
  "message": "Email is required"
}

404 Not Found:
{
  "error": "Not found",
  "message": "User not found"
}
```

---

## cURL example

- Auto-generated from the selected method, Route Path (or Document Path fallback), headers, and body.
- You can edit the cURL text area directly; the preview reflects changes.
- For GET/DELETE, query params are appended as `?key=value&...` based on the URL Parameters list.

---

## Generating the page

- The button “Generate Page” sends the built markdown content to the dev server.
- The server creates a `.md` file under `rhyla-docs/body` according to the Document Path, method, and tags.
- Spaces in the last path segment become underscores.
- Missing subfolders are created automatically.
- The dev server serves the generated page as `.html` (same path, with `.html` extension).

Example result:
- Input: Document Path `/api/users`, Method `POST`, Tags `new v1`
- File saved: `/api/post-users-new.md`
- URL in build: `/api/post-users-new.html`

---

## Tips and notes

- Tags in file names power automatic labeling in the sidebar (method + post tags like new/dep/v1).
- Route Path is for display/cURL only; Document Path controls where the file lives.
- The markdown preview uses plain text tags (no HTML badges) for consistency.
- Build and dev flows respect ignore settings (e.g., `build_ignore`) when generating the site.

---

## Quick example

Goal: Create “Create User” docs.

1) Route Information
- Title: Create User
- Route Path: `/api/users`
- Document Path: `/api/users`
- Method: POST; Tags: new, v1
- Description: “Creates a new user in the system.”

2) Request
- Headers:
  - `Content-Type: application/json`
  - `Authorization: Bearer {token}`
- Body (JSON):
```json
{
  "name": "John Doe",
  "email": "john@example.com"
}
```
- Body Fields (via table):
  - `name` string required, description “User full name”, example "John Doe"
  - `email` string required, description “User email”, example "john@example.com"

3) Responses
- 200 OK (JSON with id, name, email, createdAt)
- Errors: 400/404 blocks as needed

4) cURL (auto-filled)

5) Click Generate Page → file `/api/post-users-new.md` is created and served as HTML.

---

If you need to document non-API pages, simply leave the Body blank, choose an appropriate title, and skip tags/method as needed; the generator still creates a well-structured markdown page.
