import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config.js';
import { journeysRouter } from './api/journeys.js';
import { placesRouter }   from './api/places.js';
import { ondcRouter, eventBus } from './ondc/router.js';
import { siteVerificationHandler, onSubscribeHandler } from './ondc/onboard.js';
import { ondcAuthMiddleware } from './ondc/core/authMiddleware.js';
import { ack, nack, ErrCode } from './ondc/core/errors.js';
import { logRequest } from './ondc/store/requestLog.js';
import {
  handleOnSearch,
  handleOnSelect,
  handleOnInit,
  handleOnConfirm,
  handleOnStatus,
  handleOnSupport,
} from './ondc/adapters/metro/callbacks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, '../../frontend/dist');

const app = express();
// Capture raw body bytes for ONDC signature verification
app.use(express.json({
  limit: '256kb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// ── ONDC request/response logging ────────────────────────────────────────────
app.use((req, res, next) => {
  if (!req.path.startsWith('/on_') && !req.path.startsWith('/ondc')) return next();

  const start = Date.now();
  const reqId = Math.random().toString(36).slice(2, 8);

  console.log(`[ondc:${reqId}] --> ${req.method} ${req.path}`,
    JSON.stringify({
      headers: { authorization: req.headers.authorization ? '[PRESENT]' : '[MISSING]' },
      body: req.body,
    }));

  const origJson = res.json.bind(res);
  res.json = (body) => {
    const duration = Date.now() - start;
    console.log(`[ondc:${reqId}] <-- ${res.statusCode} (${duration}ms)`,
      JSON.stringify(body));
    logRequest({
      direction: 'inbound',
      action: req.body?.context?.action ?? req.path.replace(/^\/+/, ''),
      transactionId: req.body?.context?.transaction_id,
      messageId: req.body?.context?.message_id,
      url: req.originalUrl,
      requestBody: req.body,
      responseBody: body,
      statusCode: res.statusCode,
      durationMs: duration,
    });
    return origJson(body);
  };

  next();
});

app.use('/api', journeysRouter);
app.use('/api', placesRouter);
// Registry verifies domain ownership by fetching this at the root path (no /ondc prefix)
app.get('/ondc-site-verification.html', siteVerificationHandler);

// ── Root-level BPP callbacks ──────────────────────────────────────────────────
// ONDC sends async responses to {bap_uri}/{action}.
// With bap_uri = https://{ONDC_SUBSCRIBER_URL} (no path), callbacks arrive at
// the root (e.g. POST /on_search), not under /ondc/on_search.
// These routes are identical in behaviour to the /ondc/on_* routes below.
app.post('/on_subscribe', onSubscribeHandler);

const rootCallbacks = {
  on_search:  handleOnSearch,
  on_select:  handleOnSelect,
  on_init:    handleOnInit,
  on_confirm: handleOnConfirm,
  on_status:  handleOnStatus,
  on_support: handleOnSupport,
};
for (const [action, handler] of Object.entries(rootCallbacks)) {
  app.post(`/${action}`, ondcAuthMiddleware, (req, res) => {
    const result = handler(req.body, eventBus);
    if (!result.ok) {
      console.warn(`[ondc/root/${action}]`, result.error);
      return res.json(nack('DOMAIN-ERROR', ErrCode.INVALID_REQUEST, result.error));
    }
    return res.json(ack());
  });
}

// /ondc/* — booking API (frontend → BAP) + /ondc/on_* aliases
app.use('/ondc', ondcRouter);

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'cityone-backend',
    env: config.nodeEnv,
    time: new Date().toISOString(),
    providers: {
      googleRoutes: Boolean(config.googleKey),
      railRadar: Boolean(config.railRadarKey),
      railRadarKeyConfigured: Boolean(config.railRadarKey),
    }
  });
});

// Probe RailRadar connectivity — useful for diagnosing key issues from Cloud Run.
// Only calls the API if the key is configured; does not count toward rate limits beyond one call.
app.get('/api/health/railradar', async (req, res) => {
  const { railRadarProvider } = await import('./providers/railRadar.js');
  if (!config.railRadarKey) {
    return res.status(503).json({ ok: false, error: 'RAILRADAR_API_KEY not configured' });
  }
  try {
    // Use a known busy station pair as a connectivity check
    await railRadarProvider.trainsBetween('CSMT', 'DR');
    res.json({ ok: true, message: 'RailRadar API reachable and key valid' });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

app.get('/api/config/public', (req, res) => {
  res.json({
    googleMapsKey: config.googleFrontendKey || null
  });
});

app.use(express.static(frontendDist));
app.get(/^(?!\/api).*/, (req, res, next) => {
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) next();
  });
});

app.use((err, req, res, next) => {
  console.error('[server]', err);
  res.status(500).json({ error: 'internal_error', message: err.message });
});

app.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
});
