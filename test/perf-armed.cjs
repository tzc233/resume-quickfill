/* 用过插件的招聘页上,手动填写时插件占主线程多久(test/perf-armed.html,~170 个控件)。
 * 用户反馈「还是会让网页变卡」:记忆监听在每次聚焦 / 点选下拉、每段打字停顿时都整页识别一遍。
 * 这里用可信的键盘与点击操作,PerformanceObserver 记录主线程长任务(> 50ms)。
 * PERF_REPORT=1 只打印数字不判定(量基线用)。 */
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { chromium } = require(process.env.RQF_PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.origin !== 'http://rqf.test') return route.abort();
      const file = path.resolve(root, '.' + u.pathname);
      return route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.js') ? 'application/javascript' : 'text/html' });
    });
    await page.goto('http://rqf.test/test/perf-armed.html');
    await page.waitForTimeout(300);
    const scan = await page.evaluate(() => {
      const V2 = window.__RQF_V2_PARTS, t = [];
      for (let k = 0; k < 3; k++) {
        const a = performance.now(); const f = V2.discover(); const b = performance.now(); V2.resolveAll(f); const c = performance.now();
        t.push([b - a, c - b, f.length]);
      }
      t.sort((x, y) => x[0] + x[1] - y[0] - y[1]);
      return { discover: Math.round(t[1][0]), resolveAll: Math.round(t[1][1]), fields: t[1][2], nodes: document.querySelectorAll('*').length };
    });
    await page.evaluate(() => { window.__longTasks.length = 0; });
    const steps = [];
    const measure = async (name, fn) => {
      await page.evaluate(() => { window.__longTasks.length = 0; });
      const t0 = Date.now(); await fn(); await page.waitForTimeout(900);
      const lt = await page.evaluate(() => window.__longTasks.slice());
      steps.push({ name, longTasks: lt.length, blockedMs: Math.round(lt.reduce((a, b) => a + b, 0)), maxMs: Math.round(Math.max(0, ...lt)), wallMs: Date.now() - t0 });
    };
    const sel = (i) => page.locator('.el-select').nth(i);
    await measure('点开下拉并选一项 ×3', async () => {
      for (const i of [0, 3, 20]) { await sel(i).click(); await sel(i).locator('.el-select-dropdown__item').first().click(); await page.waitForTimeout(250); }
    });
    await measure('在文本框里打字 ×3 栏', async () => {
      for (const i of [5, 40, 90]) { await page.locator('input.el-input__inner:not([readonly])').nth(i).pressSequentially('示例手填内容', { delay: 40 }); await page.waitForTimeout(500); }
    });
    await measure('Tab 走过 20 栏', async () => {
      await page.locator('input.el-input__inner').first().focus();
      for (let k = 0; k < 20; k++) await page.keyboard.press('Tab', { delay: 20 });
    });
    const out = { scan, steps };
    console.log(JSON.stringify(out));
    if (!process.env.PERF_REPORT) {
      // 门槛:一次手动操作引起的单个长任务不超过 100ms(一帧半左右,人感觉不到卡),每组累计不超过 200ms
      for (const s of steps) {
        assert(s.maxMs <= 100, `${s.name}:最长阻塞 ${s.maxMs}ms`);
        assert(s.blockedMs <= 200, `${s.name}:累计阻塞 ${s.blockedMs}ms`);
      }
      console.log(JSON.stringify({ pass: true, total: steps.length * 2 }));
    }
  } finally { await browser.close(); }
})().catch((e) => { console.error(e.message || e); console.log(JSON.stringify({ pass: false })); process.exitCode = 1; });
