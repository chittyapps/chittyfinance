#!/usr/bin/env tsx
import fetch from 'node-fetch';

async function main() {
  const target = process.env.TARGET || 'http://127.0.0.1:8787/webhooks/mercury';
  const token = process.env.SERVICE_TOKEN || '';
  const id = process.env.EVENT_ID || `test-${Date.now()}`;
  const body = { id, type: 'test.event', data: { ok: true } };
  const res = await fetch(target, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-event-id': id,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log('Status:', res.status);
  console.log(text);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

