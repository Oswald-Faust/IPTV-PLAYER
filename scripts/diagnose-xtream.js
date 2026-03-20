#!/usr/bin/env node

require('dotenv').config();

const {
  buildXtreamHeaders,
  maskUrlSecrets,
  serializeAxiosError,
  xtreamRequest,
} = require('../lib/xtream');

const BASE = process.env.IPTV_URL;
const USER = process.env.IPTV_USER;
const PASS = process.env.IPTV_PASS;

if (!BASE || !USER || !PASS) {
  console.error('Variables requises: IPTV_URL, IPTV_USER, IPTV_PASS');
  process.exit(1);
}

const action = process.argv[2] || '';
const extras = process.argv.slice(3);
const extra = {};

for (const arg of extras) {
  const [key, ...rest] = arg.split('=');
  if (!key || rest.length === 0) continue;
  extra[key] = rest.join('=');
}

async function main() {
  const headers = buildXtreamHeaders();

  console.log('--- Xtream Diagnostic ---');
  console.log(`Base URL: ${BASE}`);
  console.log(`Action: ${action || '(none)'}`);
  console.log(`Headers: ${JSON.stringify(headers, null, 2)}`);

  try {
    const { data, url, response } = await xtreamRequest({
      baseUrl: BASE,
      username: USER,
      password: PASS,
      action,
      extra,
      headers,
    });

    console.log(`Request URL: ${maskUrlSecrets(url)}`);
    console.log(`HTTP ${response.status} ${response.statusText}`);
    console.log(`Server: ${response.headers.server || '-'}`);
    console.log('Body preview:');
    console.log(
      typeof data === 'string'
        ? data.slice(0, 1200)
        : JSON.stringify(data, null, 2).slice(0, 1200)
    );
  } catch (error) {
    const detail = serializeAxiosError(error);
    console.error('Request failed');
    console.error(JSON.stringify(detail, null, 2));
    process.exit(2);
  }
}

main();
