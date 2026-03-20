const axios = require('axios');

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function buildXtreamHeaders(env = process.env) {
  const headers = {
    'User-Agent': env.IPTV_USER_AGENT || DEFAULT_USER_AGENT,
    'Accept': env.IPTV_ACCEPT || 'application/json, text/plain, */*',
    'Accept-Language': env.IPTV_ACCEPT_LANGUAGE || 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  if (env.IPTV_ORIGIN) headers.Origin = env.IPTV_ORIGIN;
  if (env.IPTV_REFERER) headers.Referer = env.IPTV_REFERER;
  if (env.IPTV_X_REQUESTED_WITH) headers['X-Requested-With'] = env.IPTV_X_REQUESTED_WITH;

  return headers;
}

function maskUrlSecrets(input) {
  try {
    const url = new URL(String(input));
    if (url.searchParams.has('username')) url.searchParams.set('username', '***');
    if (url.searchParams.has('password')) url.searchParams.set('password', '***');
    return url.toString();
  } catch {
    return String(input || '');
  }
}

function bodyPreview(data, maxLen = 400) {
  if (data == null) return '';
  if (typeof data === 'string') return data.slice(0, maxLen);

  try {
    return JSON.stringify(data).slice(0, maxLen);
  } catch {
    return String(data).slice(0, maxLen);
  }
}

function serializeAxiosError(error) {
  const responseHeaders = error.response?.headers || {};
  const responseData = error.response?.data;
  const requestHeaders = error.config?.headers || {};

  return {
    name: error.name,
    message: error.message,
    code: error.code || null,
    status: error.response?.status || null,
    statusText: error.response?.statusText || null,
    server: responseHeaders.server || null,
    url: maskUrlSecrets(error.config?.url || ''),
    method: error.config?.method || null,
    requestHeaders: {
      'User-Agent': requestHeaders['User-Agent'] || requestHeaders['user-agent'] || null,
      'Accept': requestHeaders.Accept || requestHeaders.accept || null,
      'Accept-Language': requestHeaders['Accept-Language'] || requestHeaders['accept-language'] || null,
      'Origin': requestHeaders.Origin || requestHeaders.origin || null,
      'Referer': requestHeaders.Referer || requestHeaders.referer || null,
      'X-Requested-With': requestHeaders['X-Requested-With'] || requestHeaders['x-requested-with'] || null,
    },
    responseHeaders: {
      server: responseHeaders.server || null,
      'content-type': responseHeaders['content-type'] || null,
      location: responseHeaders.location || null,
      via: responseHeaders.via || null,
      'cf-ray': responseHeaders['cf-ray'] || null,
    },
    responseBodyPreview: bodyPreview(responseData),
  };
}

async function xtreamRequest({
  baseUrl,
  username,
  password,
  action,
  extra = {},
  timeout = 20000,
  headers = buildXtreamHeaders(),
}) {
  const params = new URLSearchParams({ username, password, ...extra });
  if (action) params.set('action', action);

  const url = `${normalizeBaseUrl(baseUrl)}/player_api.php?${params.toString()}`;

  const response = await axios.get(url, {
    timeout,
    headers,
    maxRedirects: 5,
  });

  return {
    data: response.data,
    url,
    headers,
    response,
  };
}

module.exports = {
  DEFAULT_USER_AGENT,
  buildXtreamHeaders,
  maskUrlSecrets,
  serializeAxiosError,
  xtreamRequest,
};
