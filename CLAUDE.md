# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server with HMR
npm run build      # Production build
npm run preview    # Preview production build locally
npm run lint       # Run ESLint
```

## Stack

- **React 19** with JSX (no TypeScript — `.jsx` files only)
- **Vite 8** as bundler/dev server
- **TailwindCSS v4** via `@tailwindcss/vite` plugin (no `tailwind.config.js` — configured inline)
- **ESLint** with `eslint-plugin-react-hooks` and `eslint-plugin-react-refresh`
- No test runner is configured yet.

## Architecture

The project is in its earliest stage. `src/App.jsx` is the root component rendered by `src/main.jsx` into `#root` in `index.html`. All application code will live under `src/`.

TailwindCSS v4 is configured as a Vite plugin — utility classes are available globally without any additional setup or imports.

## Project Overview

**Donjon Fall** ("Pád Donjonu") is a competitive hex-grid board game being rebuilt as a React web app.

## References

`@docs/game-rules.md` - Game rules adapted for creating the game architecture and algorithms
