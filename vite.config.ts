import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-vite-plugin";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from '@tailwindcss/vite'
import path from "path"

export default defineConfig({
	plugins: [
		tanstackRouter({
			target: 'react',
			routesDirectory: './src/react-app/routes',
			generatedRouteTree: './src/react-app/routeTree.gen.ts',
			autoCodeSplitting: true,
			quoteStyle: 'single',
			semicolons: false,
		}),
		react(),
		cloudflare(),
		tailwindcss(),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src/react-app"),
		},
	},
});
