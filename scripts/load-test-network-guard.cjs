// Preloaded only by the isolated load-test runner. Never enabled in production.
const net = require('node:net');
const local = new Set(['127.0.0.1', 'localhost', '::1']);
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const [options] = net._normalizeArgs(args);
  if (options.host && !local.has(options.host)) {
    throw new Error('Load-test runner blocked a non-loopback outbound connection');
  }
  return connect.apply(this, args);
};
const realFetch = globalThis.fetch;
globalThis.fetch = function (input, init) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!local.has(url.hostname)) throw new Error('Load-test runner blocked an external fetch');
  return realFetch(input, init);
};
