# Release Notes - Version 1.0.8

**Release Date:** November 29, 2025

## 🎉 New Features

### 🔒 Password Authentication System

We've implemented a complete password protection system for documentation, allowing you to control content access.

**Features:**
- ✅ Complete documentation protection with configurable password
- ✅ Modern and centered login interface
- ✅ Opacity effect on protected content
- ✅ Support for multiple valid passwords
- ✅ Smart blocking system after incorrect attempts
- ✅ Automatic 5-minute lockout after 5 consecutive failed attempts
- ✅ Real-time remaining attempts counter
- ✅ Clear and intuitive error messages
- ✅ Authentication persistence via localStorage

**How to use:**

In the `rhyla-docs/config.json` file, configure:

```json
{
  "password_doc": {
    "enabled": true,
    "passwords": [
      "yourSecurePassword123",
      "anotherValidPassword456"
    ]
  }
}
```

**Security features:**
- **Limited attempts:** Maximum of 5 password attempts
- **Temporary lockout:** After 5 incorrect attempts, access is blocked for 5 minutes
- **Visual counter:** Displays how many attempts remain
- **Secure persistence:** Authentication is maintained across sessions

**Useful commands:**

To logout during development, open the browser console and type:
```javascript
rhylaLogout()
```

---

### 📑 Customizable Sidebar Groups

We've significantly improved sidebar organization with support for customizable groups.

**Features:**
- ✅ Creation of custom sidebar groups
- ✅ Hierarchical content organization
- ✅ Group expansion/collapse (dropdown)
- ✅ Customizable group titles
- ✅ Support for nested folders
- ✅ Direct reference to specific files within folders
- ✅ Modern and responsive styling

**How to use:**

Configure the sidebar in `config.json`:

```json
{
  "sidebar": [
    "home",
    {
      "title": "Getting Started",
      "children": [
        "introduction",
        "installation",
        "configuration"
      ]
    },
    {
      "title": "API Reference",
      "children": [
        "api/endpoints",
        "api/authentication",
        "api/examples"
      ]
    }
  ]
}
```

**Supported formats:**

1. **Simple file:** `"home"` → home.md or home.html
2. **Complete folder:** `"guide"` → displays all files from guide/ folder
3. **File in folder:** `"api/endpoints"` → displays only api/endpoints.md
4. **Group with title:** 
   ```json
   {
     "title": "Documentation",
     "children": ["doc1", "doc2"]
   }
   ```

---

## 🔧 Improvements

### Authentication Interface
- Modern design with centered card
- Blur effect (backdrop-filter) on background
- SVG icons for better visual communication
- Smooth transitions and animations
- Immediate visual feedback on error

### Sidebar
- Left alignment of group titles
- Removal of unnecessary decorative characters
- Better visual contrast between groups and items
- Expansion/collapse indicator arrows
- Support for complex folder structures

---

## 🐛 Bug Fixes

- ✅ Fixed folder expansion/collapse issue in sidebar
- ✅ Fixed group title alignment
- ✅ Improved file detection within folders
- ✅ Fixed authentication state persistence
- ✅ Improved error handling in password system

---

## 📖 Documentation

### New Documentation Added:
- Complete configuration guide for `password_doc`
- Usage examples for sidebar group system
- Complete `config.json` reference

---

## 🔄 Compatibility

- ✅ Compatible with all previous versions
- ✅ No changes required in existing projects
- ✅ New features are opt-in (must be explicitly enabled)

---

## 📝 Technical Notes

### Authentication System
The system uses `localStorage` to maintain authentication state and attempts. The following data is stored:
- `rhyla_auth_token`: Authentication token
- `rhyla_auth_attempts`: Number of login attempts
- `rhyla_auth_blocked_until`: Timestamp of lockout end

### Security
⚠️ **Important:** This authentication system is basic and suitable for protecting internal documentation. For applications requiring high security, consider implementing server-side authentication.

---

## 🚀 Next Steps

We're working on:
- Enhanced search system
- Customizable themes
- PDF export
- Documentation versioning
- Offline mode

---

## 💬 Feedback

Found a problem or have suggestions? 
- Open an issue on GitHub: [rhyla_documentation/issues](https://github.com/joseRibamar21/rhyla_documentation/issues)
- Contact us through our website: [rhyladoc.com](https://rhyladoc.com)

---

**Thank you for using Rhyla! 🎉**

Version 1.0.8 - Making your documentation more secure and organized.