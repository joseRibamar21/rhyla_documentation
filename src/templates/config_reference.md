# Rhyla Configuration Reference

This document provides a detailed explanation of all available options in the `config.json` file, which is the central configuration file for your Rhyla documentation site.

## Basic Configuration

### title
**Type**: `string`  
**Default**: `"Documentation Standard"`

The title of your documentation site. This will be displayed in the browser tab and can be used in the header.

```json
"title": "My Project Documentation"
```

### description
**Type**: `string`  
**Default**: `"Generated with Rhyla"`

A brief description of your documentation site. This will be used in the meta description tag for SEO purposes.

```json
"description": "Official documentation for My Project"
```

### site_url
**Type**: `string`  
**Default**: `null`

The public URL where your documentation site will be hosted. This is used for generating absolute URLs for sitemap and canonical links.

```json
"site_url": "https://docs.example.com/"
```

### base
**Type**: `string`  
**Default**: `"/"`

The base path where your site will be deployed. Use this if your site will not be at the root of the domain.

```json
"base": "/docs/"
```

## Features and Functionality

### side_topics
**Type**: `boolean`  
**Default**: `true`

When enabled, displays a table of contents panel on the right side of the page, showing all headings in the current document.

```json
"side_topics": true
```

### allow_raw_html
**Type**: `boolean`  
**Default**: `false`

Controls whether raw HTML is allowed in Markdown files. When disabled, HTML tags in Markdown files will be escaped for security.

```json
"allow_raw_html": true
```

## Build Options

### build_ignore
**Type**: `string[]`  
**Default**: `["kit_dev_rhyla"]`

An array of paths or patterns to exclude from the build. Paths are relative to the `body/` directory.

```json
"build_ignore": [
  "kit_dev_rhyla",
  "drafts",
  "private-docs"
]
```

## Navigation and Structure

### sidebar
**Type**: `Array<string | Object>`  
**Default**: Empty array

Configures the structure and content of the sidebar navigation. This is an array that can contain strings (direct paths to files) or objects with a title and children array for grouped items.

```json
"sidebar": [
  "home",
  {
    "title": "Getting Started",
    "children": [
      "installation",
      "quick-start"
    ]
  },
  {
    "title": "Guides",
    "children": [
      "basic",
      "advanced"
    ]
  },
  "changelog"
]
```

#### Sidebar String Items
Simple string items should match the name of a file (without extension) or directory in your `body/` folder:

```json
"sidebar": [
  "home",
  "getting-started",
  "api-reference"
]
```

## Example Complete Configuration

Here's a complete example showing all available configuration options:

```json
{
  "title": "Project Documentation",
  "description": "Comprehensive documentation for My Project",
  "site_url": "https://docs.example.com/",
  "side_topics": true,
  "allow_raw_html": false,
  "base": "/",
  "build_ignore": [
    "drafts",
  ],
  "sidebar": [
    "home",
    {
      "title": "Getting Started",
      "children": [
        "installation",
        "quickstart"
      ]
    },
    {
      "title": "Guides",
      "children": [
        "guides",
      ]
    },
    "api-reference",
    "changelog"
  ]
}
```

## Best Practices

1. **Structure Your Content**: Use the sidebar to create a logical hierarchy for your documentation.

2. **Start with Home**: Always include "home" as the first item in your sidebar for consistent navigation.

3. **Group Related Topics**: Use group objects to organize related content together.

4. **Limit Nesting**: Try to limit nesting to 2-3 levels for better usability.

5. **Use Clear Titles**: Choose concise, descriptive titles for sidebar groups and pages.

6. **Consider Base Path**: If deploying to a subdirectory, set the `base` property accordingly.

7. **Secure Content**: Disable `allow_raw_html` unless you explicitly need to include HTML in your Markdown.

8. **Optimize for SEO**: Always provide a descriptive `title` and `description` for better search engine visibility.