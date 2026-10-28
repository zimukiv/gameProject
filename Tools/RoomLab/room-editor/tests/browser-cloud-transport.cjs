'use strict';
// Acceptance-only transport. Reuse the browser's TLS connection for production API probes.
// Credentials remain in the isolated browser session; callers must close it in finally.
async function open(endpoint) {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ headless: true, channel: 'msedge' }),
    page = await browser.newPage();
  await page.goto(endpoint);
  const fetcher = async (url, options = {}) => {
    const data = await page.evaluate(
      async ({ url, method, headers, body }) => {
        const response = await fetch(url, {
          method,
          headers,
          body: Array.isArray(body) ? new Uint8Array(body) : body,
          signal: AbortSignal.timeout(40000),
          cache: 'no-store',
        });
        return {
          status: response.status,
          bytes: [...new Uint8Array(await response.arrayBuffer())],
        };
      },
      {
        url,
        method: options.method,
        headers: options.headers,
        body:
          typeof options.body === 'string'
            ? options.body
            : options.body
              ? [...options.body]
              : undefined,
      },
    );
    return new Response(new Uint8Array(data.bytes), { status: data.status });
  };
  return { browser, fetcher };
}
module.exports = { open };
