---
name: rebuild
description: Use when code changes are made to the OpenCodeTTS project and you need to rebuild the OpenCode plugin and/or Windows EXE for the floating ball application.
---

# Rebuild OpenCodeTTS

Rebuild the OpenCode plugin and Windows EXE after code changes.

## When to Use

- After modifying `src/index.ts` or any TypeScript files in `src/`
- After modifying `floating-ball/main.js` or any Electron app files
- After modifying `package.json` configurations
- When user asks to "rebuild", "build", or "compile" the project
- Before testing or distributing changes

## Quick Reference

| Component | Command | Output |
|-----------|---------|--------|
| OpenCode Plugin | `npm run build` | `dist/index.js` |
| Windows EXE (fast) | `cd floating-ball && npm run build:dir` | `floating-ball/dist/win-unpacked/` |
| Windows Installer | `cd floating-ball && npm run build` | `floating-ball/dist/*.exe` |

## Commands

### Build OpenCode Plugin

```bash
cd /d/Users/Administrator/opencode/OpenCodeTTS
npm run build
```

Output: `dist/index.js`, `dist/index.js.map`

### Build Windows EXE (Unpacked - Fast)

For quick testing without creating installer:

```bash
cd /d/Users/Administrator/opencode/OpenCodeTTS/floating-ball
npm run build:dir
```

Output: `floating-ball/dist/win-unpacked/OpenCodeTTS.exe`

### Build Windows Installer (Full)

For distribution:

```bash
cd /d/Users/Administrator/opencode/OpenCodeTTS/floating-ball
npm run build
```

Output: `floating-ball/dist/OpenCodeTTS Setup 1.0.0.exe`

## Build Both (Recommended)

After code changes, rebuild both:

```bash
# From project root
cd /d/Users/Administrator/opencode/OpenCodeTTS
npm run build
cd floating-ball && npm run build:dir
```

## Common Issues

| Issue | Solution |
|-------|----------|
| "electron in dependencies" error | Move `electron` to `devDependencies` in `floating-ball/package.json` |
| TypeScript errors | Check `tsconfig.json` and fix type errors |
| Build timeout | Normal for first build (downloads Electron ~142MB) |
| Missing icon warning | Add `build/icon.ico` (optional, uses default icon) |

## Output Locations

```
OpenCodeTTS/
├── dist/                    # OpenCode plugin
│   ├── index.js
│   └── index.js.map
└── floating-ball/
    └── dist/
        ├── win-unpacked/    # Unpacked EXE (build:dir)
        │   └── OpenCodeTTS.exe
        └── *.exe            # NSIS installer (build)
```
