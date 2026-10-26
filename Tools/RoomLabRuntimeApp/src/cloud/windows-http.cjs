'use strict';
// Windows' bundled curl uses the platform TLS stack. Credentials travel only on stdin.
const { spawn } = require('node:child_process'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  crypto = require('node:crypto');
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    if (
      u.protocol !== 'https:' &&
      !(u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname))
    )
      return reject(new Error('云端地址必须使用 HTTPS'));
    const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'curl.exe');
    if (!fs.existsSync(exe)) return reject(new Error('此 Windows 未提供 curl 网络组件'));
    let bodyFile = null;
    const config = [
      'url = ' + JSON.stringify(url),
      'request = ' + JSON.stringify(options.method || 'GET'),
      'silent',
      'show-error',
      'connect-timeout = 10',
      'max-time = 40',
      'dump-header = "-"',
    ];
    for (const [key, value] of Object.entries(options.headers || {})) {
      if (/[\r\n]/.test(key + value)) return reject(new Error('网络请求头无效'));
      config.push('header = ' + JSON.stringify(key + ': ' + value));
    }
    if (options.body) {
      bodyFile = path.join(os.tmpdir(), 'room-cloud-body-' + crypto.randomUUID());
      fs.writeFileSync(bodyFile, options.body, { mode: 0o600 });
      config.push('data-binary = ' + JSON.stringify('@' + bodyFile));
    }
    // Disable user curlrc: it must never turn redirect following on for secret-bearing requests.
    const child = spawn(exe, ['--disable', '--config', '-'], { windowsHide: true });
    const chunks = [];
    let size = 0,
      failed = false;
    const cleanup = () => {
      if (bodyFile)
        try {
          fs.unlinkSync(bodyFile);
        } catch {}
    };
    child.stdout.on('data', (b) => {
      size += b.length;
      if (size > 35 * 1024 * 1024) {
        failed = true;
        child.kill();
      } else chunks.push(b);
    });
    child.stderr.resume();
    child.on('error', () => {
      cleanup();
      reject(new Error('无法启动 Windows 网络组件'));
    });
    child.on('close', (code) => {
      cleanup();
      if (code !== 0 || failed) return reject(new Error('云端网络请求未完成，请检查网络后重试'));
      let bytes = Buffer.concat(chunks),
        status = 0,
        headers;
      while (bytes.subarray(0, 5).toString() === 'HTTP/') {
        const end = bytes.indexOf('\r\n\r\n');
        if (end < 0) break;
        const lines = bytes.subarray(0, end).toString().split('\r\n');
        status = Number(lines.shift().split(' ')[1]);
        headers = new Headers();
        for (const line of lines) {
          const i = line.indexOf(':');
          if (i > 0) headers.append(line.slice(0, i), line.slice(i + 1).trim());
        }
        bytes = bytes.subarray(end + 4);
        if (status >= 200 && !bytes.subarray(0, 5).equals(Buffer.from('HTTP/'))) break;
      }
      if (status < 100) return reject(new Error('云端响应格式无效'));
      resolve(new Response([204, 205, 304].includes(status) ? null : bytes, { status, headers }));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(config.join('\n') + '\n');
  });
}
module.exports = { request };
