import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { chromium } from 'playwright';

const url = new URL(process.env.LOAD_TEST_ADMIN_URL ?? '');
assert.equal(url.hostname,'127.0.0.1'); assert.equal(url.pathname,'/postgres');
const probe=createServer();
await new Promise((done,fail)=>{probe.once('error',fail);probe.listen(3206,'127.0.0.1',done);});
await new Promise(done=>probe.close(done));
const admin=new pg.Pool({connectionString:url.toString()});
const name=`login_ui_${randomUUID().replaceAll('-','')}_test`;
let created=false, database, app, browser;
try {
  await admin.query(`CREATE DATABASE "${name}"`); created=true;
  url.pathname=`/${name}`; database=new pg.Pool({connectionString:url.toString()});
  await migrate(drizzle(database),{migrationsFolder:'drizzle'});
  await cp('.next/static','.next/standalone/.next/static',{recursive:true});
  await cp('public','.next/standalone/public',{recursive:true});
  const base='http://127.0.0.1:3206';
  app=spawn(process.execPath,['--require',resolve('scripts/load-test-network-guard.cjs'),resolve('.next/standalone/server.js')],{
    windowsHide:true,stdio:'ignore',env:{...process.env,DATABASE_URL:url.toString(),REALTIME_DATABASE_URL:url.toString(),
      JWT_SECRET:'local-login-backoff-test-secret-only-32chars',CLIENT_URL:base,HOSTNAME:'127.0.0.1',PORT:'3206',
      NODE_ENV:'production',NODE_OPTIONS:'',STARTER_MODE:'1',SCHEDULED_MESSAGES_ENABLED:'1',
      RESEND_API_KEY:'',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',VAPID_PRIVATE_KEY:'',SUPABASE_SERVICE_ROLE_KEY:'',SUPABASE_URL:'',
    }});
  let ready=false;
  for(let i=0;i<100;i++) {
    assert.equal(app.exitCode,null);
    try { const response=await fetch(base+'/api/health'); if(response.status===204){ready=true;break;} } catch {}
    await new Promise(done=>setTimeout(done,200));
  }
  assert(ready);
  browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  let attempts=0; const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const target=new URL(route.request().url());
    if(target.origin!==base) return route.abort();
    if(target.pathname==='/api/auth/login') {
      attempts++;
      return route.fulfill({status:attempts===1?503:401,contentType:'application/json',
        headers:{'Retry-After':'5'},body:JSON.stringify({error:attempts===1?'Sign-in is busy. Please try again in a few seconds.':'Incorrect email, username, or password.'})});
    }
    return route.continue();
  });
  await page.goto(base+'/login');
  await page.getByLabel('Email or username',{exact:true}).fill('test@example.invalid');
  await page.getByLabel('Password',{exact:true}).fill('CorrectPassword99!');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByText('Sign-in is busy. Please try again in a few seconds.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByText(/Please retry sign-in in/).waitFor();
  assert.equal(attempts,1,'a repeated click must not resubmit credentials during Retry-After');
  await new Promise(done=>setTimeout(done,5100));
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByText('Incorrect email, username, or password.',{exact:true}).waitFor();
  assert.equal(attempts,2); assert.deepEqual(errors,[]);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log('PASS: mobile login respects Retry-After, retries after cooldown, has no overflow or browser exceptions. Responses mocked; no external APIs called.');
} finally {
  await browser?.close();
  if(app && app.exitCode===null){const exited=new Promise(done=>app.once('exit',done));app.kill();await exited;}
  await database?.end();
  if(created) {
    // Socket shutdown may reach PostgreSQL after Pool.end resolves. Never
    // FORCE-drop a fixture while retiring clients can still receive errors.
    let connections = 0;
    for (let attempt = 0; attempt < 100; attempt++) {
      connections = (await admin.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1', [name])).rows[0].n;
      if (connections === 0) break;
      await new Promise(done => setTimeout(done, 50));
    }
    assert.equal(connections, 0, 'All fixture connections close before database removal');
    await admin.query(`DROP DATABASE "${name}"`);
  }
  await admin.end();
}
