/* 弹窗的简历版本选择。弹窗要调 tabs / scripting / storage,这里在页面脚本之前
 * 注入假的扩展 API:executeScript 的 files 调用直接放行,func 调用就地在弹窗里执行,
 * 再用一个假的 __RQF_V2.fill 截下引擎真正拿到的档案和附件。数据一律是「示例 XX」。 */
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const {chromium} = require(process.env.RQF_PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '..');

// 两份独立的简历:私企(默认)与央国企,事实与经历都可以不同
const PROFILE = { _name: '私企', basic: { fullName: '示例姓名' }, intro: '私企自我介绍',
  work: [{ company: '示例科技', desc: '私企版实习描述' }] };
const SOE = { basic: { fullName: '示例姓名' }, intro: '国企版自我介绍',
  work: [{ company: '示例科技', desc: '国企版实习描述' }], projects: [{ name: '只在国企版的项目' }] };

const open = async (browser, host, db) => {
  const page = await browser.newPage();
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== 'http://rqf.test') return route.abort();
    const file = path.resolve(root, '.' + u.pathname);
    const type = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
    return route.fulfill({ body: fs.readFileSync(file), contentType: type });
  });
  await page.addInitScript(({ host, db }) => {
    window.__db = db;
    window.__calls = [];
    const pick = (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys])
      .filter((k) => k in db).map((k) => [k, JSON.parse(JSON.stringify(db[k]))]));
    const storage = { local: {
      async get(k) { return pick(k); },
      async set(o) { Object.assign(db, JSON.parse(JSON.stringify(o))); },
      async remove(k) { delete db[k]; },
    } };
    window.__RQF_V2 = { async fill(profile, resumeFile) {
      window.__captured = { profile, resumeFile };
      return { filled: [{ label: '示例', value: '示例' }], skipped: [], unmatched: [] };
    } };
    window.browser = {
      runtime: { openOptionsPage() {} },
      storage,
      permissions: { async contains() { return true; } },
      tabs: { async query() { return [{ id: 1, url: `https://${host}/apply`, title: '示例' }]; } },
      scripting: { async executeScript(o) {
        window.__calls.push({ files: o.files || null, args: o.args || null });
        if (o.files) return [];
        return [{ result: await o.func(...(o.args || [])) }];
      } },
    };
  }, { host, db });
  await page.goto('http://rqf.test/popup.html');
  await page.waitForTimeout(300);
  return page;
};

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const checks = [];
  const ok = (name, cond, extra) => { assert(cond, name + (extra ? ' :: ' + JSON.stringify(extra) : '')); checks.push(name); };
  try {
    const db = { profile: PROFILE, altProfiles: { soe: { name: '央国企', profile: SOE } }, lastBackupAt: Date.now(),
      resumeFile: { name: '默认.pdf', size: 1, dataBase64: '' },
      resumeFiles: { soe: { name: '国企.pdf', size: 1, dataBase64: '' } } };

    let page = await open(browser, 'jobs.example.com', db);
    const opts = await page.locator('#ver option').allTextContents();
    ok('弹窗列出全部简历', opts.join('/') === '私企/央国企', opts);
    ok('没选过就用默认版本', (await page.locator('#ver').inputValue()) === 'default');

    await page.selectOption('#ver', 'soe');
    await page.waitForTimeout(150);
    let saved = await page.evaluate(() => window.__db.rqfVersionBySite);
    ok('选择按站点记住', saved && saved['jobs.example.com'] === 'soe', saved);

    await page.click('#btn-fill');
    await page.waitForFunction(() => window.__captured);
    const cap = await page.evaluate(() => window.__captured);
    const calls = await page.evaluate(() => window.__calls);
    ok('注入了版本解析脚本', calls.some((c) => c.files && c.files.includes('versions.js')), calls);
    ok('引擎拿到的是所选简历的全部内容', cap.profile.intro === '国企版自我介绍' && cap.profile.work[0].desc === '国企版实习描述'
      && cap.profile.projects && cap.profile.projects[0].name === '只在国企版的项目', cap.profile);
    ok('引擎拿到的是所选简历的附件', cap.resumeFile && cap.resumeFile.name === '国企.pdf', cap.resumeFile);
    ok('引擎看不到简历名等元数据', !JSON.stringify(cap.profile).includes('"_name"'));
    ok('弹窗显示用的是哪个版本', /央国企/.test(await page.locator('#status').innerText()));
    // 下一个弹窗接着用这一个写过的存储(每次打开弹窗都是新页面,状态只在存储里)
    Object.assign(db, await page.evaluate(() => window.__db));
    await page.close();

    // 再次打开同一站点:沿用上次的选择;换一个站点:回到默认
    page = await open(browser, 'jobs.example.com', db);
    ok('同站点再开沿用上次的版本', (await page.locator('#ver').inputValue()) === 'soe');
    await page.close();
    page = await open(browser, 'other.example.com', db);
    ok('别的站点仍是默认版本', (await page.locator('#ver').inputValue()) === 'default');
    await page.click('#btn-fill');
    await page.waitForFunction(() => window.__captured);
    const cap2 = await page.evaluate(() => window.__captured);
    ok('默认简历填默认内容与附件', cap2.profile.intro === '私企自我介绍' && !cap2.profile.projects
      && cap2.resumeFile.name === '默认.pdf', cap2);
    await page.close();

    // 央国企没上传附件:不带附件,也不拿私企的 PDF 顶替,并且说清楚
    const noPdf = { ...db, resumeFiles: {}, rqfVersionBySite: { 'jobs.example.com': 'soe' } };
    page = await open(browser, 'jobs.example.com', noPdf);
    await page.click('#btn-fill');
    await page.waitForFunction(() => window.__captured);
    const cap3 = await page.evaluate(() => window.__captured);
    ok('没传附件的简历不顶替别的附件', cap3.resumeFile === null, cap3.resumeFile);
    ok('弹窗说明这份简历没有附件', /央国企[\s\S]*未上传附件/.test(await page.locator('#status').innerText()));
    await page.close();

    // 没建过版本:选择器不出现,行为与原来一致
    const plain = { profile: { basic: { fullName: '示例姓名' }, intro: '私企自我介绍' }, lastBackupAt: Date.now() };
    page = await open(browser, 'jobs.example.com', plain);
    ok('没有版本时不显示选择器', !(await page.locator('#ver-bar').isVisible()));
    await page.close();

    console.log(JSON.stringify({ pass: true, total: checks.length, checks }));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e.message || e); console.log(JSON.stringify({ pass: false })); process.exitCode = 1; });
