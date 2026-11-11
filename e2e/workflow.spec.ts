import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';

const API = 'http://127.0.0.1:8787';
const LAPSED = '£93,531';
const LAPSED_CENTS = 9353125;

/** Every test gets its own private session with the real UK shop loaded. */
async function openCaseStudy(page: Page, hash = '/overview') {
  const sid = `e2e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const r = await page.request.post(`${API}/api/dataset/case-study`, { headers: { 'X-Session-Id': sid } });
  test.skip(r.status() === 404, 'case study not bundled in this checkout');
  await page.addInitScript((id) => localStorage.setItem('bs-sid', id), sid);
  await page.goto(`/#${hash}`);
  return sid;
}

/** RFC 4180 rows. */
function parseCsv(text: string) {
  const out: string[][] = [];
  let row: string[] = [],
    cell = '',
    q = false;
  const end = () => {
    row.push(cell);
    cell = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') end();
    else if (ch === '\n') {
      end();
      out.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell || row.length) {
    end();
    out.push(row);
  }
  return out;
}

test('keyboard only: top finding → its evidence → its rows → CSV that adds up to the penny', async ({
  page,
}) => {
  await openCaseStudy(page);
  const strip = page.getByRole('button', { name: /^Fix this first:/ });
  await expect(strip).toContainText(LAPSED);
  // Reach it with Tab alone.
  let found = false;
  for (let i = 0; i < 60 && !found; i++) {
    await page.keyboard.press('Tab');
    found = await strip.evaluate((el) => el === document.activeElement);
  }
  expect(found).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/risk\?f=store-lapsed/);
  // Focus moves onto the opened finding, and the next Tab reaches its rows.
  await expect(page.getByRole('region', { name: /^Finding: 10 of your best customers/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toContainText('See the affected rows');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/source\?drill=/);
  await expect(page.getByText('Matches the finding to the penny')).toBeVisible();
  await expect(page.getByText('£93,531.25').first()).toBeVisible();

  // The download follows the displayed scope and adds up to the same pennies.
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByText('Download CSV').click()]);
  const [cols, ...rows] = parseCsv(fs.readFileSync((await dl.path())!, 'utf8').trim());
  const si = cols.indexOf('Sales');
  const cents = rows.reduce((s, r) => s + Math.round(Number(r[si]) * 100), 0);
  expect(cents).toBe(LAPSED_CENTS);
  expect(new Set(rows.map((r) => r[cols.indexOf('Customer')])).size).toBe(10);
});

test('changing a filter while an answer is late never shows the old list next to new results', async ({
  page,
}) => {
  await openCaseStudy(page, '/customers');
  await expect(page.getByText(LAPSED).first()).toBeVisible();
  const ukWarning = await page.evaluate(
    () => (document.querySelector('main')!.textContent!.match(/(\d+)repeat customers, 45–90/) ?? [])[1],
  );
  expect(ukWarning).toBeTruthy();
  // From now on, hold every win-back answer for 6 seconds, so new early-warning results arrive first.
  let held = 0,
    released = 0;
  await page.route('**/api/tools/win-back-list', async (route: Route) => {
    held++;
    await new Promise((r) => setTimeout(r, 6000));
    await route.continue();
    released++;
  });
  await page.getByRole('button', { name: 'Country' }).click();
  await page.getByRole('button', { name: 'Germany', exact: true }).click();
  // Watch every 200 ms until the held answers are released. Whenever the page shows anything other than the UK
  // early warning, the UK win-back figure must not be on screen next to it.
  const seen = new Set<string>();
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline && !(held > 0 && released >= held)) {
    const s = await page.evaluate(() => {
      const t = document.querySelector('main')?.textContent ?? '';
      return {
        ew: (t.match(/(\d+)repeat customers, 45–90/) ?? [])[1] ?? null,
        hasOld: t.includes('£93,531'),
      };
    });
    const state = s.ew === null ? 'loading' : s.ew === ukWarning ? 'uk' : 'new';
    seen.add(state);
    if (state !== 'uk') expect(s.hasOld, `old win-back figure shown while page is "${state}"`).toBe(false);
    await page.waitForTimeout(200);
  }
  expect(held).toBeGreaterThan(0);
  expect(seen.has('loading') || seen.has('new')).toBe(true); // the late-answer window really happened
  // Once released, the German answer is shown, and still never the UK one.
  await expect(page.getByText(/Best customers who went quiet|No customer history/).first()).toBeVisible();
  await expect(page.locator('main')).not.toContainText(LAPSED);
});

test('a failed analysis shows what went wrong, and Try again loads the real answer', async ({ page }) => {
  // Fail every forecast request until the user presses Try again (development mode starts each request twice).
  let fail = true,
    calls = 0;
  await page.route('**/api/tools/forecast-sales', async (route) => {
    calls++;
    if (fail)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          tool: 'forecast-sales',
          ms: 0,
          error: { code: 'BUSY', message: 'Server busy (test).' },
        }),
      });
    return route.continue();
  });
  await openCaseStudy(page, '/forecast');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('That didn’t load');
  await expect(alert).toContainText('Server busy (test).');
  fail = false;
  await alert.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Track record' })).toBeVisible();
  expect(calls).toBeGreaterThanOrEqual(2);
});

test('undefined accuracy is shown as unavailable, never as 0.0%', async ({ page }) => {
  await page.route('**/api/tools/forecast-sales', async (route) => {
    const res = await route.fetch();
    const j = await res.json();
    if (j.data?.accuracy) {
      j.data.accuracy.wape = null; // what the engine returns when the tested months sold nothing
      j.data.accuracy.mae = 0;
      for (const m of j.data.methods) m.wape = null;
    }
    await route.fulfill({ response: res, json: j });
  });
  await openCaseStudy(page, '/forecast');
  await expect(page.getByText('Percentage error unavailable')).toBeVisible();
  await expect(page.locator('main')).not.toContainText('0.0%');
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  test('the top finding is on the first screen; no page scrolls sideways; no titles are cut off', async ({
    page,
  }) => {
    await openCaseStudy(page);
    const strip = page.getByRole('button', { name: /^Fix this first:/ });
    await expect(strip).toBeVisible();
    expect((await strip.boundingBox())!.y).toBeLessThan(812);
    for (const p of ['overview', 'risk', 'source', 'customers', 'stock', 'forecast', 'prove', 'reports']) {
      await page.goto(`/#/${p}`);
      await page.waitForTimeout(3500);
      const r = await page.evaluate(() => ({
        sideways: document.documentElement.scrollWidth - window.innerWidth,
        cut: [...document.querySelectorAll('main h3')]
          .filter((h) => h.scrollWidth > h.clientWidth + 1)
          .map((h) => (h as HTMLElement).innerText),
      }));
      expect(r.sideways, `${p} scrolls sideways`).toBeLessThanOrEqual(0);
      expect(r.cut, `${p} cuts off titles`).toEqual([]);
    }
    // Navigation is reachable: the Source Data tab can be opened from the top bar.
    await page
      .getByRole('button', { name: /Source Data/ })
      .first()
      .click();
    await expect(page).toHaveURL(/#\/source/);
  });
});
