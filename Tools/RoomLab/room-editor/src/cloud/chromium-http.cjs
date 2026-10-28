'use strict';
// Inject Electron's browser network stack; no Electron dependency in the shared relay client.
function create(net) {
  const request = (url, options = {}) =>
    net.fetch(url, { ...options, credentials: 'omit', cache: 'no-store' });
  request.transport = 'chromium-system-network';
  return request;
}
module.exports = { create };
