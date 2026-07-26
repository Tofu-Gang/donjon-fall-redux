import { fileURLToPath } from "url";
import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
// The style-guide is a sibling repo developed in parallel; it isn't published
// to npm, so we point the alias directly at its real path on disk. This keeps
// `npm i` from being able to break the link by pruning node_modules.
const styleGuide = resolve(rootDir, "..", "Style-guite-donjon-fall");

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "style-guide-donjon-fall/tkajui": resolve(styleGuide, "src/lib/tkajui/index.js"),
            // textures subpath MUST be listed before the exact `…/donjon` alias,
            // or Vite would resolve `…/donjon/textures` to index.js.
            // Unlike tokens/enums (tsup → dist), textures.js is imported as
            // source next to textures/*.jpg — different from the usual lib
            // export pipeline; see style-guide donjon/textures.js header.
            "style-guide-donjon-fall/donjon/textures": resolve(styleGuide, "src/lib/donjon/textures.js"),
            "style-guide-donjon-fall/donjon/icons": resolve(styleGuide, "src/lib/donjon/icons.jsx"),
            "style-guide-donjon-fall/donjon": resolve(styleGuide, "src/lib/donjon/index.js"),
            react: resolve(rootDir, "node_modules/react"),
            "react-dom": resolve(rootDir, "node_modules/react-dom")
        },
        dedupe: ["react", "react-dom"]
    },
    server: {
        fs: {
            allow: [rootDir, styleGuide],
        }
    },
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: "./src/test-setup.js"
    }
});
