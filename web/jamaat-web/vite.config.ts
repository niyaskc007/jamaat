import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// In dev the SPA runs on :5173 and the API on a separate port (default :5174). Image src URLs
// returned by the API are relative ("/api/v1/events/{id}/cover/file" etc.) so the browser
// resolves them against :5173 and hits Vite's 404. Production deployments serve API + SPA from
// one origin so relative URLs work natively; dev needs an explicit proxy that mirrors that.
// Target is read from VITE_API_BASE_URL so it tracks whatever .env.development configures.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBase = env.VITE_API_BASE_URL || 'http://localhost:5174';
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: apiBase,
          changeOrigin: true,
          secure: false,
          // Forward the original client IP so the API's login-audit + geolocation see the real
          // browser address instead of the Vite proxy's loopback. Production behind nginx/IIS
          // gets this for free; this makes dev consistent.
          xfwd: true,
        },
      },
    },
  };
});
