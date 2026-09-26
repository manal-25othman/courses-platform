/**
 * The production sign-in as a browser actually performs it, stage by stage.
 *
 * Read-only. It signs in as the platform operator — the one account whose
 * password the deployment holds — and it types nothing else, saves nothing and
 * changes nothing. A pupil's Home cannot be timed here, because nobody has
 * given this a pupil's password and it must not invent one; what it measures
 * is every stage the two journeys share, plus the destination the operator
 * actually lands on.
 *
 *   SITE_URL=… PLATFORM_ADMIN_PASSWORD=… node tooling/deploy/diagnose-login-browser.mjs
 */
import { chromium } from 'playwright';

const site = (process.env.SITE_URL ?? '').replace(/\/+$/, '');
const username = process.env.PLATFORM_ADMIN_USERNAME?.trim() || 'operator';
const password = process.env.PLATFORM_ADMIN_PASSWORD?.trim();

if (!site || !password) {
  console.error('SITE_URL and PLATFORM_ADMIN_PASSWORD are required.');
  process.exit(2);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const calls = [];
page.on('requestfinished', async (request) => {
  const address = request.url().replace(site, '');
  if (!/\/api\/v1\//.test(address) && !/\.(js|css)$/.test(address) && !/^\/(login|dashboard|admin|school)/.test(address)) {
    return;
  }
  const timing = request.timing();
  calls.push({
    url: address.split('?')[0].slice(0, 62),
    start: Math.round(timing.startTime),
    ms: Math.round(timing.responseEnd - timing.requestStart),
    status: (await request.response())?.status() ?? 0,
  });
});

const stages = {};
const t0 = performance.now();
const at = () => Math.round(performance.now() - t0);

await page.goto(`${site}/login`, { waitUntil: 'domcontentloaded' });
stages['1. /login html arrived'] = at();
await page.waitForSelector('#username');
stages['2. the form can be typed into'] = at();

await page.fill('#username', username);
await page.fill('#password', password);

const answered = page.waitForResponse((r) => r.url().includes('/auth/login'));
await page.click('button[type=submit]');
const loginResponse = await answered;
stages['3. POST /auth/login answered'] = at();
const cookies = (await loginResponse.allHeaders())['set-cookie'] ?? '';
stages['4. session cookie in that same response'] = at();
console.log(`  sign-in answered HTTP ${loginResponse.status()}, ${cookies ? cookies.split(/,(?=[^;]+=)/).length : 0} cookie(s)`);

await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
const landed = new URL(page.url()).pathname;
stages[`5. redirected to ${landed}`] = at();

await page
  .waitForSelector('.card, .page-head, .trail-stop, table, h1', { timeout: 90000 })
  .catch(() => {});
stages['9. first meaningful content on screen'] = at();

await page
  .waitForFunction(() => !/Loading|Signing in/i.test(document.body.innerText), null, { timeout: 90000 })
  .catch(() => {});
stages['10. page usable, nothing still loading'] = at();

console.log('\n=== stages, ms from the first navigation ===');
let previous = 0;
for (const [name, ms] of Object.entries(stages)) {
  console.log(`  ${String(ms).padStart(7)} ms  (+${String(ms - previous).padStart(6)})  ${name}`);
  previous = ms;
}

console.log('\n=== every request, in the order the browser made it ===');
const ordered = calls.sort((a, b) => a.start - b.start);
const base = ordered[0]?.start ?? 0;
for (const call of ordered) {
  console.log(`  t+${String(call.start - base).padStart(6)}  ${String(call.ms).padStart(6)} ms  ${call.status}  ${call.url}`);
}
const api = ordered.filter((c) => c.url.includes('/api/v1/'));
console.log(`\n  ${api.length} API calls after loading the page: ${api.map((c) => c.url.replace('/api/v1', '')).join(', ')}`);
console.log(`  slowest single request: ${Math.max(...ordered.map((c) => c.ms))} ms`);

await browser.close();
console.log('\nNothing above wrote to production.');
