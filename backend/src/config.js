import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

// Resolve .env from repo root regardless of the process's working directory.
// config.js lives at backend/src/config.js; the repo root is three levels up.
// In Cloud Run the container has no .env file so dotenv silently does nothing —
// Cloud Run injects env vars directly into process.env before Node starts.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requireEnv(name) {
  // .trim() strips trailing newlines that Secret Manager injects when a secret
  // was stored with `echo key | gcloud secrets versions add ...`.
  // Without trimming, Node.js rejects the Authorization header with
  // "Invalid character in header content".
  const value = process.env[name]?.trim();
  if (!value) {
    console.warn(`[config] Missing env var: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT || 8080),
  nodeEnv: process.env.NODE_ENV || 'development',
  googleKey: requireEnv('GOOGLE_BACKEND_MAPS_KEY'),
  // Only browser-safe keys here — never fall back to the backend key.
  googleFrontendKey:
    process.env.GOOGLE_FRONTEND_MAPS_KEY ||
    process.env.GOOGLE_ANDROID_MAPS_KEY ||
    null,
  railRadarKey: requireEnv('RAILRADAR_API_KEY'),
  mapplsStaticKey: process.env.MAPPLS_STATIC_KEY || null
};
