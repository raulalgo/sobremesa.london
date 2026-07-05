// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  server: {
    // Dedicated port for this project (4321 clashes with the Meseta Crew site).
    // PORT env override lets the Claude preview harness assign its own port.
    port: Number(process.env.PORT) || 4330,
    host: true,
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
