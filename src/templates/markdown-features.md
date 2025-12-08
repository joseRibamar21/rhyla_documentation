# Markdown Features

Rhyla supports rich markdown formatting with extended features. Learn how to create beautiful documentation with these powerful tools.

## Basic Markdown Syntax

### Headers

Create headers with `#` symbols:

```markdown
# H1 Header
## H2 Header
### H3 Header
#### H4 Header
##### H5 Header
###### H6 Header
```

# H1 Header
## H2 Header
### H3 Header
#### H4 Header
##### H5 Header
###### H6 Header

---

### Text Formatting

```markdown
**Bold text**
*Italic text*
***Bold and italic***
~~Strikethrough~~
`Inline code`
```

**Bold text**  
*Italic text*  
***Bold and italic***  
~~Strikethrough~~  
`Inline code`

---

### Lists

**Unordered Lists:**

```markdown
- Item 1
- Item 2
  - Nested item 2.1
  - Nested item 2.2
- Item 3
```

- Item 1
- Item 2
  - Nested item 2.1
  - Nested item 2.2
- Item 3

**Ordered Lists:**

```markdown
1. First item
2. Second item
   1. Nested item
   2. Another nested item
3. Third item
```

1. First item
2. Second item
   1. Nested item
   2. Another nested item
3. Third item

**Task Lists:**

```markdown
- [x] Completed task
- [ ] Incomplete task
- [ ] Another task
```

- [x] Completed task
- [ ] Incomplete task
- [ ] Another task

---

### Links

```markdown
[Link text](https://example.com)
[Link with title](https://example.com "Link title")
[Relative link](./other-page)
```

[Link text](https://example.com)  
[Link with title](https://example.com "Link title")  
[Relative link](./other-page)

**Reference-style links:**

```markdown
[Link to Google][1]
[Link to GitHub][2]

[1]: https://google.com
[2]: https://github.com
```

---

### Images

```markdown
![Alt text](./image.png)
![Image with title](./logo.png "Logo")
```

You can also use HTML for more control:

```html
<img src="./logo.png" alt="Logo" width="200" />
```

---

### Blockquotes

```markdown
> This is a blockquote
> 
> It can span multiple lines

> **Note:** You can use formatting inside blockquotes
```

> This is a blockquote
> 
> It can span multiple lines

> **Note:** You can use formatting inside blockquotes

**Nested blockquotes:**

```markdown
> Level 1
>> Level 2
>>> Level 3
```

---

### Horizontal Rules

```markdown
---
***
___
```

---

## Code Blocks

### Inline Code

Use single backticks for inline code:

```markdown
The `console.log()` function prints to console.
```

The `console.log()` function prints to console.

---

### Fenced Code Blocks

Use triple backticks with optional language:

````markdown
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
```
````

```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
```

### Supported Languages

Rhyla supports syntax highlighting for many languages:

**JavaScript/TypeScript:**
```javascript
const message = "Hello, World!";
console.log(message);
```

**Python:**
```python
def greet(name):
    print(f"Hello, {name}!")
```

**Java:**
```java
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
```

**CSS:**
```css
.container {
  display: flex;
  justify-content: center;
  align-items: center;
}
```

**JSON:**
```json
{
  "name": "Rhyla",
  "version": "1.0.8",
  "features": ["markdown", "themes", "search"]
}
```

**Bash/Shell:**
```bash
#!/bin/bash
echo "Hello, World!"
npm install -g rhyla
```

**SQL:**
```sql
SELECT * FROM users WHERE active = true;
```

**HTML:**
```html
<!DOCTYPE html>
<html>
  <head><title>Page</title></head>
  <body><h1>Hello!</h1></body>
</html>
```

And many more: Ruby, PHP, Go, Rust, C, C++, C#, Swift, Kotlin, etc.

---

## Tables

```markdown
| Feature | Supported | Notes |
|---------|-----------|-------|
| Markdown | ✅ | Full support |
| Tables | ✅ | With alignment |
| Code | ✅ | Syntax highlighting |
```

| Feature | Supported | Notes |
|---------|-----------|-------|
| Markdown | ✅ | Full support |
| Tables | ✅ | With alignment |
| Code | ✅ | Syntax highlighting |

### Column Alignment

```markdown
| Left | Center | Right |
|:-----|:------:|------:|
| L1 | C1 | R1 |
| L2 | C2 | R2 |
```

| Left | Center | Right |
|:-----|:------:|------:|
| L1 | C1 | R1 |
| L2 | C2 | R2 |

---

## Extended Features

### Emojis

Use emoji shortcodes or Unicode:

```markdown
:rocket: :sparkles: :heart: :fire:
🚀 ✨ ❤️ 🔥
```

:rocket: :sparkles: :heart: :fire:  
🚀 ✨ ❤️ 🔥

---

### Automatic Links

URLs and emails are automatically converted to links:

```markdown
https://rhyladoc.com
contact@example.com
```

https://rhyladoc.com  
contact@example.com

---

### Escape Characters

Use backslash to escape special characters:

```markdown
\*Not italic\*
\[Not a link\]
\`Not code\`
```

\*Not italic\*  
\[Not a link\]  
\`Not code\`

---

## HTML Support

Rhyla allows HTML in markdown (when `allow_raw_html` is enabled):

### Custom Styling

```html
<div style="background: #f0f9ff; padding: 20px; border-radius: 8px;">
  <h3 style="color: #0369a1; margin-top: 0;">💡 Pro Tip</h3>
  <p>You can mix HTML and Markdown for custom layouts!</p>
</div>
```

<div style="background: #f0f9ff; padding: 20px; border-radius: 8px;">
  <h3 style="color: #0369a1; margin-top: 0;">💡 Pro Tip</h3>
  <p>You can mix HTML and Markdown for custom layouts!</p>
</div>

### Details/Summary (Collapsible Sections)

```html
<details>
<summary>Click to expand</summary>

This content is hidden by default!

- You can use markdown here
- **Bold text**
- `Code`

</details>
```

<details>
<summary>Click to expand</summary>

This content is hidden by default!

- You can use markdown here
- **Bold text**
- `Code`

</details>

### Buttons and Links

```html
<a href="https://example.com" style="
  display: inline-block;
  padding: 10px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 600;
">
  Get Started →
</a>
```

### Alerts/Callouts

Create custom alert boxes:

```html
<div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 16px 0;">
  <strong style="color: #dc2626;">⚠️ Warning</strong>
  <p style="margin: 8px 0 0; color: #991b1b;">This action cannot be undone!</p>
</div>
```

<div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 16px 0;">
  <strong style="color: #dc2626;">⚠️ Warning</strong>
  <p style="margin: 8px 0 0; color: #991b1b;">This action cannot be undone!</p>
</div>

```html
<div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; margin: 16px 0;">
  <strong style="color: #059669;">✅ Success</strong>
  <p style="margin: 8px 0 0; color: #047857;">Operation completed successfully!</p>
</div>
```

<div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; margin: 16px 0;">
  <strong style="color: #059669;">✅ Success</strong>
  <p style="margin: 8px 0 0; color: #047857;">Operation completed successfully!</p>
</div>

```html
<div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 16px 0;">
  <strong style="color: #1d4ed8;">ℹ️ Info</strong>
  <p style="margin: 8px 0 0; color: #1e40af;">Here's some helpful information.</p>
</div>
```

<div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 16px 0;">
  <strong style="color: #1d4ed8;">ℹ️ Info</strong>
  <p style="margin: 8px 0 0; color: #1e40af;">Here's some helpful information.</p>
</div>

---

## Special Rhyla Features

### Automatic Tags

Rhyla automatically adds tags to pages based on file names:

**HTTP Methods:**
- `get-users.md` → <span style="background: #10b981; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">GET</span>
- `post-login.md` → <span style="background: #3b82f6; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">POST</span>
- `put-update.md` → <span style="background: #f59e0b; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">PUT</span>
- `delete-user.md` → <span style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">DELETE</span>
- `patch-data.md` → <span style="background: #8b5cf6; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">PATCH</span>

**Version Tags:**
- `api-v1.md` → <span style="background: #6b7280; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">v1</span>
- `guide-v2.md` → <span style="background: #6b7280; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">v2</span>

**Status Tags:**
- `feature-new.md` → <span style="background: #10b981; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">NEW</span>
- `old-api-dep.md` → <span style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">DEPRECATED</span>

### Side Topics (Table of Contents)

Rhyla automatically generates a table of contents from your headers. All `##`, `###`, `####` headers appear in the side panel for quick navigation.

**Best practices:**
- Use descriptive header text
- Keep header hierarchy logical
- Don't skip levels (e.g., H2 → H4)

---

## Tips for Great Documentation

### 1. Use Headers Hierarchically

```markdown
# Main Title (H1) - Use once per page
## Major Section (H2)
### Subsection (H3)
#### Detail (H4)
```

### 2. Add Code Examples

Always include practical examples:

```markdown
Here's how to use the API:

​```javascript
const response = await fetch('/api/users');
const users = await response.json();
​```
```

### 3. Use Visual Elements

Break up text with:
- **Tables** for structured data
- **Lists** for steps or features
- **Blockquotes** for important notes
- **Code blocks** for examples
- **Images** for diagrams

### 4. Create Scannable Content

Use:
- Short paragraphs
- Bullet points
- Clear headers
- Bold for emphasis
- Whitespace between sections

### 5. Link Related Content

```markdown
See also:
- [Quick Start Guide](quick-start)
- [Configuration Reference](config_reference)
- [Deployment Guide](deployment)
```

---

## Configuration

Enable/disable HTML in `config.json`:

```json
{
  "allow_raw_html": true
}
```

⚠️ **Security Note:** Only enable `allow_raw_html` if you trust all content contributors.

---

## Examples

### API Documentation Example

```markdown
## GET /api/users

Retrieve a list of all users.

### Request

​```http
GET /api/users?limit=10&offset=0
Authorization: Bearer <token>
​```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| limit | integer | No | Number of results (default: 10) |
| offset | integer | No | Pagination offset (default: 0) |

### Response

​```json
{
  "users": [
    { "id": 1, "name": "John Doe" },
    { "id": 2, "name": "Jane Smith" }
  ],
  "total": 42
}
​```

### Status Codes

- `200` - Success
- `401` - Unauthorized
- `500` - Server Error
```

### Tutorial Example

```markdown
## Installation Tutorial

Follow these steps to get started:

### Step 1: Install Node.js

Download from [nodejs.org](https://nodejs.org)

### Step 2: Install Rhyla

​```bash
npm install -g rhyla
​```

### Step 3: Create Project

​```bash
rhyla init my-docs
cd my-docs
rhyla dev
​```

✅ **Success!** Your documentation is now running at http://localhost:3000
```

---

## Need Help?

- 📖 [How Rhyla Works](how-it-works)
- ⚙️ [Configuration Reference](config_reference)
- 🚀 [Quick Start Guide](quick-start)
- ❓ [Troubleshooting](troubleshooting)

Happy writing! ✍️✨
