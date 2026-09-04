import { readFileSync } from 'fs';
import { execSync } from 'child_process';

async function main() {
  const cookieFile = '.freebuff/qa/b.txt';
  const raw = readFileSync(cookieFile, 'utf8');
  console.log('--- raw file length:', raw.length, '---');
  console.log(raw);
  console.log('--- parsed cookie jar ---');
  const dataLines = raw.split('\n').filter(l => l && !l.startsWith('#'));
  console.log('dataLines count:', dataLines.length);
  for (const l of dataLines) {
    const c = l.split('\t');
    console.log(c.length + ' cols: domain=' + c[0] + ' path=' + c[2] + ' secure=' + c[3] + ' expires=' + c[4] + ' name=' + c[5] + ' value=' + c[6].slice(0, 20) + '…');
    if (c.length >= 7 && c[5] === 'maddy_session') {
      console.log('maddy_session cookie FOUND. domain=' + c[0] + ' path=' + c[2] + ' secure=' + c[3] + ' expires=' + c[4]);
    }
  }
  const pairs = [];
  for (const l of dataLines) {
    const c = l.split('\t');
    if (c.length >= 7) pairs.push(c[5] + '=' + c[6]);
  }
  console.log('Cookie header:', pairs.join('; '));
  console.log('--- fetch /api/auth/me (with header) ---');
  const me = await fetch('http://localhost:49696/api/auth/me', { headers: { Cookie: pairs.join('; ') } }).then(r => r.json());
  console.log('me status', me);
  console.log('--- curl path ---');
  try {
    console.log(execSync('curl -s -b .freebuff/qa/b.txt http://localhost:49696/api/e2ee/keys', { cwd: process.cwd() }).toString().slice(0, 300));
  } catch(e){ console.error(e); }
  console.log('--- raw session token decode ---');
  const token = pairs[0];
  if (!token) console.log('no token found');
  else {
    const parts = token.split('.');
    if (parts.length !== 3) console.log('token is not JWT');
    else {
      const pad = (s) => s.replace(/-/g,'+').replace(/_/g,'/') + '=='.slice( (s.length % 4) );
      try {
        const payload = JSON.parse(Buffer.from(pad(atob(parts[1])), 'base64').toString('utf8'));
        console.log('payload:', JSON.stringify(payload));
      } catch(e){ console.log('base64 decode failed', e); }
    }
  }
}
main();

