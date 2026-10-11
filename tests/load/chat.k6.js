/* global __ENV, open */
import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';
import { Rate } from 'k6/metrics';

// Intentionally local-only. Redirects are disabled, so requests cannot escape.
const base = __ENV.BASE_URL || 'http://127.0.0.1:3190';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d{4,5}$/.test(base)) {
  throw new Error('Load tests only accept an explicit HTTP loopback host and port. Production/staging URLs are rejected.');
}
if (!__ENV.K6_FIXTURE_FILE) throw new Error('Use npm run test:load to create an isolated fake-data environment first.');
const fixture = JSON.parse(open(__ENV.K6_FIXTURE_FILE));
if (fixture.baseUrl !== base || fixture.environment !== 'isolated-local-k6') throw new Error('Fixture/environment mismatch.');
const accounts = new SharedArray('synthetic chat accounts', () => fixture.accounts);
const fullStages = [
  { duration: '30s', target: 20 }, { duration: '2m', target: 20 },
  { duration: '30s', target: 50 }, { duration: '2m', target: 50 },
  { duration: '30s', target: 100 }, { duration: '3m', target: 100 },
  { duration: '30s', target: 0 },
];
const stages = __ENV.LOAD_PROFILE === 'smoke'
  ? [{ duration: '5s', target: 2 }, { duration: '15s', target: 2 }, { duration: '5s', target: 0 }]
  : __ENV.LOAD_PROFILE === 'login-tuning'
    // Short configuration comparison only. The full profile certifies sustained load.
    ? [{ duration: '30s', target: 20 }, { duration: '15s', target: 20 },
      { duration: '30s', target: 50 }, { duration: '15s', target: 50 },
      { duration: '30s', target: 100 }, { duration: '15s', target: 100 }, { duration: '15s', target: 0 }]
  : __ENV.LOAD_PROFILE === 'steady'
    ? [{ duration: '30s', target: 100 }, { duration: '3m', target: 100 }, { duration: '30s', target: 0 }]
    : fullStages;
const semanticFailures = new Rate('journey_failed');
const actions = ['login', 'main_screen', 'chat_list', 'history', 'send_message', 'confirm_message', 'communities'];
const thresholds = {
  http_req_duration: ['p(95)<500'],
  http_req_failed: ['rate<0.01'],
  journey_failed: ['rate<0.01'],
};
for (const action of actions) {
  if (__ENV.LOAD_PROFILE === 'steady' && action === 'login') continue;
  thresholds[`http_req_duration{action:${action}}`] = ['p(95)<500'];
  thresholds[`http_req_failed{action:${action}}`] = ['rate<0.01'];
}
if (__ENV.LOAD_PROFILE !== 'smoke') {
  for (const level of __ENV.LOAD_PROFILE === 'steady' ? [100] : [20, 50, 100]) {
    thresholds[`http_req_duration{stage:hold_${level}}`] = ['p(95)<500'];
    thresholds[`http_req_failed{stage:hold_${level}}`] = ['rate<0.01'];
  }
}
export const options = {
  scenarios: { chat: { executor: 'ramping-vus', startVUs: 0, stages, gracefulRampDown: '20s', gracefulStop: '20s' } },
  thresholds, noCookiesReset: true, maxRedirects: 0,
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  systemTags: ['status', 'method', 'name', 'scenario', 'expected_response', 'error_code'],
};
function stageTag() {
  const elapsed = exec.instance.currentTestRunDuration / 1000;
  let end = 0;
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    end += parseInt(stage.duration, 10) * (stage.duration.endsWith('m') ? 60 : 1);
    if (elapsed < end) return (i % 2 ? 'hold_' : 'ramp_') + stage.target;
  }
  return 'ramp_down';
}
function params(action, account) {
  return { redirects: 0, timeout: '10s', headers: {
    Origin: base, 'Content-Type': 'application/json', 'User-Agent': 'Circlo-local-k6',
    // Distinct simulated clients, on loopback only. Real rate limits stay enabled.
    'X-Forwarded-For': account.ip,
  }, tags: { action, name: action, stage: stageTag() } };
}
function json(response) { try { return response.json(); } catch { return null; } }
function expect(response, condition, description) {
  const ok = check(response, { [description]: () => condition });
  semanticFailures.add(!ok, { stage: stageTag() });
  return ok;
}
export function setup() {
  const response = http.get(base + '/api/health', { redirects: 0, timeout: '5s', tags: { action: 'preflight', name: 'preflight', stage: 'preflight' } });
  if (response.status !== 204 || response.headers['X-Load-Test-Environment'] !== fixture.runId) {
    throw new Error('Isolated runner attestation missing; refusing to load-test this server.');
  }
}
let signedIn = false;
export default function chatJourney() {
  const account = accounts[exec.vu.idInTest - 1];
  if (!account) fail('Missing unique account for this VU');
  if (!signedIn) {
    if (__ENV.LOAD_PROFILE === 'steady') {
      if (!account.authCookies?.length) fail('Returning-user profile requires real preauthenticated cookies');
      for (const cookie of account.authCookies) http.cookieJar().set(base, cookie.name, cookie.value);
      signedIn = true;
    } else {
    const login = http.post(base + '/api/auth/login', JSON.stringify({ identifier: account.username, password: fixture.password }), params('login', account));
    if (!expect(login, login.status === 200 && json(login)?.user?.id === account.id, 'sign-in succeeds for this account')) {
      sleep(5); return;
    }
    signedIn = true;
    sleep(0.5 + Math.random());
    }
  }
  const main = http.get(base + '/app/chats', params('main_screen', account));
  expect(main, main.status === 200 && main.body.includes('Circlo'), 'main screen renders without redirect');
  const list = http.get(base + '/api/conversations', params('chat_list', account));
  const conversations = json(list)?.conversations;
  expect(list, list.status === 200 && Array.isArray(conversations) && conversations.some(c => c.id === account.conversations[0]), 'own chats load');
  sleep(0.7 + Math.random());
  const conversation = account.conversations[exec.vu.iterationInScenario % account.conversations.length];
  const url = base + '/api/conversations/' + conversation + '/messages';
  const history = http.get(url + '?limit=30', params('history', account));
  expect(history, history.status === 200 && Array.isArray(json(history)?.messages), 'message history loads');
  sleep(1 + Math.random());
  const uuid = '00000000-0000-4000-8000-' + (exec.vu.idInTest * 1000000 + exec.vu.iterationInScenario).toString(16).padStart(12, '0');
  const sent = http.post(url, JSON.stringify({ clientMessageId: uuid, text: account.ciphertext, encrypted: true }), params('send_message', account));
  const message = json(sent)?.message;
  if (expect(sent, sent.status === 201 && message?.encrypted === true && message?.senderId === account.id, 'ciphertext persisted for the sender')) {
    sleep(0.4 + Math.random() * 0.4);
    const confirmed = http.get(url + '?limit=30', params('confirm_message', account));
    expect(confirmed, confirmed.status === 200 && json(confirmed)?.messages?.some(m => m.id === message.id), 'sent message appears in history');
  }
  sleep(0.5 + Math.random());
  const directory = http.get(base + '/api/communities', params('communities', account));
  const data = json(directory);
  expect(directory, directory.status === 200 && Array.isArray(data?.publicCommunities) && data?.myCommunities?.every(c => c.createdBy === account.id), 'community data is public or belongs to this user');
  // Reading/typing time keeps the scenario realistic and below existing anti-spam limits.
  sleep(6 + Math.random() * 4);
}
export function handleSummary(data) {
  return { [__ENV.K6_SUMMARY_FILE || './k6-summary.json']: JSON.stringify(data, null, 2) };
}
