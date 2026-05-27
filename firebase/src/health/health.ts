import { onRequest } from 'firebase-functions/v2/https';

export const health = onRequest((_req, res) => {
  res.status(200).json({ status: 'ok', service: 'firebase-functions', timestamp: new Date().toISOString() });
});

export const readiness = onRequest((_req, res) => {
  const missing = ['GCLOUD_PROJECT'].filter((key) => !process.env[key]);
  if (missing.length) {
    res.status(503).json({ status: 'not_ready', missing, timestamp: new Date().toISOString() });
    return;
  }

  res.status(200).json({ status: 'ready', service: 'firebase-functions', timestamp: new Date().toISOString() });
});
