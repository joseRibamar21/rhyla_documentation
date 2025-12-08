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

## Security Features

### password_doc
**Type**: `Object`  
**Default**: `{ "enabled": false, "passwords": [] }`  
**Version**: `1.0.8+`

Enables password protection for your documentation site. When enabled, visitors must enter a valid password before accessing the content.

```json
"password_doc": {
  "enabled": true,
  "passwords": [
    "yourSecurePassword123",
    "anotherValidPassword456"
  ]
}
```

#### password_doc.enabled
**Type**: `boolean`  
**Default**: `false`

Controls whether password authentication is active. Set to `true` to require authentication.

#### password_doc.passwords
**Type**: `string[]`  
**Default**: `[]`

An array of valid passwords. Users can authenticate with any password in this list.

**Security Features:**
- Maximum 5 login attempts before temporary lockout
- 5-minute automatic lockout after failed attempts
- Session persistence via localStorage
- Attempt counter with visual feedback
- Beautiful, modern authentication UI

**Example Configuration:**

```json
{
  "password_doc": {
    "enabled": true,
    "passwords": [
      "myTeamPassword2024",
      "clientAccessKey"
    ]
  }
}
```

**Important Security Notes:**
- ⚠️ This is a client-side authentication system suitable for protecting internal documentation
- 🔒 For production environments requiring high security, implement server-side authentication
- 🔑 Use strong, unique passwords
- 📝 Store passwords securely and rotate them regularly
- 👥 Consider using different passwords for different user groups

**Development Tip:**  
To logout during development, open the browser console and run:
```javascript
rhylaLogout()
```

## Navigation and Structure

### sidebar
**Type**: `Array<string | Object>`  
**Default**: Empty array  
**Version**: `1.0.8+ (Enhanced with groups)`

Configures the structure and content of the sidebar navigation. This is an array that can contain strings (direct paths to files/folders) or objects with a title and children array for custom grouped items.

**Enhanced in v1.0.8:**
- ✨ Custom group titles
- 📁 Collapsible/expandable folders
- 🎯 Active state highlighting
- 🌳 Nested folder support
- 🎨 Smooth animations

#### Basic Structure

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

Simple string items can reference:

1. **Single File** - Displays one page
```json
"sidebar": [
  "home",
  "getting-started",
  "api-reference"
]
```

2. **Entire Folder** - Auto-expands to show all files in folder
```json
"sidebar": [
  "home",
  "guides",        // Shows all files in guides/ folder
  "api"            // Shows all files in api/ folder
]
```

3. **Specific File in Folder** - References a single file within a folder
```json
"sidebar": [
  "home",
  "guides/installation",    // Only shows installation.md from guides/
  "api/authentication"      // Only shows authentication.md from api/
]
```

#### Sidebar Group Objects

Create custom groups with titles and children:

```json
{
  "title": "API Reference",
  "children": [
    "api/authentication",
    "api/users",
    "api/posts"
  ]
}
```

**Group Properties:**
- `title` (string) - Display name for the group
- `children` (array) - Array of file/folder paths or nested groups

#### Advanced Example with Nested Groups

```json
"sidebar": [
  "home",
  "how-it-works",
  {
    "title": "Getting Started",
    "children": [
      "installation",
      "quickstart",
      "configuration"
    ]
  },
  {
    "title": "Documentation",
    "children": [
      {
        "title": "Guides",
        "children": [
          "guide/basic",
          "guide/advanced"
        ]
      },
      {
        "title": "API Reference",
        "children": [
          "api/authentication",
          "api/endpoints"
        ]
      }
    ]
  },
  {
    "title": "Release Notes",
    "children": [
      "releases/release_notes_1.0.8"
    ]
  }
]
```

#### Folder Behavior

When you reference a folder in the sidebar:
- It appears as an expandable/collapsible item with a folder icon (📁)
- All `.md` and `.html` files in the folder are automatically listed
- Subfolders are recursively processed
- Active page state is highlighted
- Folder state (open/closed) is preserved based on current navigation

#### File Naming Conventions for Tags

Rhyla automatically recognizes special patterns in file names:

**HTTP Method Tags:**
```
get-users.md     → Displays: GET Users (green tag)
post-login.md    → Displays: POST Login (blue tag)
put-update.md    → Displays: PUT Update (orange tag)
delete-user.md   → Displays: DELETE User (red tag)
patch-data.md    → Displays: PATCH Data (purple tag)
```

**Version Tags:**
```
api-v1.md        → Displays: api v1 (version badge)
guide-v2.md      → Displays: guide v2 (version badge)
```

**Status Tags:**
```
feature-new.md   → Displays: feature NEW (new badge)
api-dep.md       → Displays: api DEPRECATED (deprecated badge)
```

## Example Complete Configuration

Here's a complete example showing all available configuration options (v1.0.8):

```json
{
  "title": "Project Documentation",
  "description": "Comprehensive documentation for My Project",
  "site_url": "https://docs.example.com/",
  "side_topics": true,
  "allow_raw_html": false,
  "base": "/",
  "password_doc": {
    "enabled": false,
    "passwords": [
      "teamPassword2024"
    ]
  },
  "build_ignore": [
    "drafts",
    "kit_dev_rhyla"
  ],
  "sidebar": [
    "home",
    "how-it-works",
    {
      "title": "Getting Started",
      "children": [
        "installation",
        "quickstart",
        "configuration"
      ]
    },
    {
      "title": "Guides",
      "children": [
## Best Practices

### Content Organization

1. **Structure Your Content**: Use the sidebar to create a logical hierarchy for your documentation.

2. **Start with Home**: Always include "home" as the first item in your sidebar for consistent navigation.

3. **Group Related Topics**: Use group objects to organize related content together.

4. **Limit Nesting**: Try to limit nesting to 2-3 levels for better usability.

5. **Use Clear Titles**: Choose concise, descriptive titles for sidebar groups and pages.

### Security

6. **Password Protection**: Enable `password_doc` only when necessary and use strong, unique passwords.

7. **Secure Content**: Disable `allow_raw_html` unless you explicitly need to include HTML in your Markdown.

8. **Regular Password Rotation**: Update passwords periodically for better security.

9. **Separate Environments**: Use different passwords for development, staging, and production.

### Deployment

10. **Consider Base Path**: If deploying to a subdirectory, set the `base` property accordingly.

11. **Optimize for SEO**: Always provide a descriptive `title` and `description` for better search engine visibility.

12. **Clean Build Folder**: Use `build_ignore` to exclude unnecessary files from production builds.

### File Naming

13. **Use Descriptive Names**: Choose clear, lowercase file names with hyphens (e.g., `quick-start.md`).

14. **Leverage Tagging**: Use HTTP method prefixes (`get-`, `post-`) and status suffixes (`-new`, `-dep`) for automatic tagging.

15. **Consistent Conventions**: Stick to one naming convention throughout your documentation.

## What's New in v1.0.8

### 🔒 Password Authentication System
- Client-side password protection for documentation
- Multiple valid passwords support
- 5-attempt limit with 5-minute lockout
- Beautiful, modern authentication UI
- Session persistence via localStorage

### 📑 Enhanced Sidebar Groups
- Custom group titles with collapsible sections
- Nested folder support with automatic expansion
- Active page highlighting
- Smooth animations for folder transitions
- Better visual hierarchy

### 🎨 Improved User Experience
- Modern gradient-based authentication interface
- Shake animation on incorrect password
- Real-time attempt counter
- Contact administrator message
- "Made with Rhyla" branding

## Migration Guide

### Upgrading from v1.0.7 to v1.0.8

No breaking changes! All existing configurations work as-is.

**Optional enhancements:**

1. **Add password protection** (if needed):
```json
"password_doc": {
  "enabled": true,
  "passwords": ["yourPassword"]
}
```

2. **Reorganize sidebar with groups**:
```json
"sidebar": [
  "home",
  {
    "title": "Documentation",
    "children": ["guide1", "guide2"]
  }
]
```

3. **Use new file naming conventions**:
- Rename `users.md` → `get-users.md` for automatic GET tag
- Rename `new_feature.md` → `feature-new.md` for NEW badge
  ]
}
```

## Real-World Example with Password Protection

Example configuration for a protected internal documentation site:

```json
{
  "title": "Internal Team Documentation",
  "description": "Private documentation for development team",
  "site_url": "https://internal-docs.company.com/",
  "side_topics": true,
  "allow_raw_html": false,
  "base": "/",
  "password_doc": {
    "enabled": true,
    "passwords": [
      "DevTeam2024!",
      "ClientAccess2024"
    ]
  },
  "build_ignore": [
    "drafts",
    "wip-features"
  ],
  "sidebar": [
    "home",
    {
      "title": "Getting Started",
      "children": [
        "onboarding",
        "setup"
      ]
    },
    {
      "title": "Architecture",
      "children": [
        "architecture/overview",
        "architecture/database",
        "architecture/api"
      ]
    },
    {
      "title": "API Documentation",
      "children": [
        "api/get-users",
        "api/post-login",
        "api/put-update-user"
      ]
    }
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