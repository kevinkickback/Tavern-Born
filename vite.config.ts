import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";
import { resolve } from "path";

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname;

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		electron({
			main: {
				entry: "electron/main.ts",
			},
			preload: {
				input: "electron/preload.ts",
			},
		}),
	],
	resolve: {
		alias: {
			"@": resolve(projectRoot, "src"),
		},
	},
});
