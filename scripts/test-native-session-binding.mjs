import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";

const bundle = await build({ bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", stdin: { resolveDir: process.cwd(), loader: "jsx", contents: `
  import React from 'react';import {createRoot} from 'react-dom/client';import {NativeAppBridge} from './src/components/native-app-bridge';
  const root=createRoot(document.getElementById('root'));window.renderAuth=auth=>{window.fixtureAuth=auth;root.render(<NativeAppBridge/>);};
` }, plugins: [{ name: "native-session-io", setup(builder) {
  builder.onResolve({ filter: /^(next\/navigation|@\/components\/providers\/auth-provider|@\/lib\/native-platform|@\/lib\/native-push-bridge|@capacitor\/.*)$/ }, args => ({ path: args.path, namespace: "fixture" }));
  builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "next/navigation" ? "const router={push(){}};export const useRouter=()=>router;"
    : args.path.endsWith("auth-provider") ? "export const useAuth=()=>window.fixtureAuth;"
    : args.path.endsWith("native-platform") ? "export const isNativeApp=()=>true;export const hasCapacitorRuntime=()=>false;"
    : args.path.endsWith("native-push-bridge") ? "export const syncHostedStartup=async id=>(window.bindings??=[]).push(id);"
    : "export const App={};export const StatusBar={};export const Style={};export const Keyboard={};export const KeyboardResize={};" }));
} }] });
const server = createServer((req, res) => { if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].contents); } else res.end('<div id="root"></div><script src="/bundle.js"></script>'); });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch();
try {
  const page = await browser.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(() => window.renderAuth({ status: "authenticated", user: { id: "account-a" } }));
  await page.waitForFunction(() => window.bindings?.length === 1);
  // Same ID, fresh authorized object: the response can have rotated HttpOnly cookies.
  await page.evaluate(() => window.renderAuth({ status: "authenticated", user: { id: "account-a" } }));
  await page.waitForFunction(() => window.bindings?.length === 2);
  await page.evaluate(() => window.renderAuth({ status: "authenticated", user: { id: "account-b" } }));
  await page.waitForFunction(() => window.bindings?.at(-1) === "account-b");
  await page.evaluate(() => window.renderAuth({ status: "unauthenticated", user: null }));
  await page.waitForFunction(() => window.bindings?.at(-1) === null);
  assert.deepEqual(await page.evaluate(() => window.bindings), ["account-a", "account-a", "account-b", null]);
  assert.deepEqual(errors, []);
  console.log("PASS native startup binding renews after same-account auth refresh, switches accounts and clears on logout");
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
