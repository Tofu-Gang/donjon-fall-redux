import { fileURLToPath } from "url";
import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const styleGuide = resolve(rootDir, "node_modules/style-guide-donjon-fall");

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "style-guide-donjon-fall/tkajui": resolve(styleGuide, "src/lib/tkajui/index.js"),
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
