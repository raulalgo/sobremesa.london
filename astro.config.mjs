// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// https://astro.build/config
export default defineConfig({
  server: {
    // Dedicated port for this project (4321 clashes with the Meseta Crew site).
    // PORT env override lets the Claude preview harness assign its own port.
    port: Number(process.env.PORT) || 4330,
    host: true,
  },
  vite: {
    // HTTPS is opt-in (npm run dev:https) because phones only deliver
    // deviceorientation events on secure origins; plain `dev` stays http
    // so the Claude preview harness keeps working.
    plugins: [tailwindcss(), ...(process.env.HTTPS ? [basicSsl()] : [])],
  },
});
