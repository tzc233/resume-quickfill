/* 档案页(options.html)回归。档案页依赖扩展存储,页内脚本跑不起来 ——
 * 这里用 addInitScript 在页面脚本之前注入一个内存版 browser.storage.local,
 * 再用 Playwright 真点、真按键、真接确认框。夹具数据一律是「示例 XX」。 */
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const {chromium} = require(process.env.RQF_PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '..');

const PROFILE = {
  basic: { fullName: '示例姓名', phone: '', email: 'demo@example.com', birthday: '2000.01.01' },
  education: [
    // 故意按正序排:本科在前、硕士在后 —— 插件按顺序逐段填,第一段应是最新的
    { school: '示例学院', degree: '学士', startTime: '2020.09', endTime: '2024-06', rank: '3/30' },
    { school: '示例大学', degree: '硕士', startTime: '2024-09', endTime: '2027-06' },
  ],
  work: [{ company: '示例科技', title: '示例实习生', startTime: '2025-07', endTime: '2025' }],
  futureField: { keep: '页面不认识的字段不许被保存吞掉' },
};

(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const checks = [];
  const ok = (name, cond, extra) => { assert(cond, name + (extra ? ' :: ' + JSON.stringify(extra) : '')); checks.push(name); };
  try {
    const page = await browser.newPage();
    await page.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.origin !== 'http://rqf.test') return route.abort();
      const file = path.resolve(root, '.' + u.pathname);
      if (!file.startsWith(root + path.sep)) return route.abort();
      const type = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
      return route.fulfill({body: fs.readFileSync(file), contentType: type});
    });
    await page.addInitScript((profile) => {
      const db = { profile, lastBackupAt: Date.now() };
      const pick = (keys) => {
        if (keys == null) return { ...db };
        const ks = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(ks.filter((k) => k in db).map((k) => [k, JSON.parse(JSON.stringify(db[k]))]));
      };
      window.__db = db;
      window.browser = { runtime: {}, storage: { local: {
        async get(keys) { return pick(keys); },
        async set(obj) { Object.assign(db, JSON.parse(JSON.stringify(obj))); },
        async remove(k) { delete db[k]; },
      } } };
    }, PROFILE);
    const dialogs = [];
    let acceptNext = false;
    page.on('dialog', (d) => { dialogs.push({ type: d.type(), msg: d.message() }); acceptNext ? d.accept() : d.dismiss(); });

    await page.goto('http://rqf.test/options.html');
    await page.waitForSelector("#health-list li");

    /* 1. 月份框吞值:type=month 只认 YYYY-MM,「2020.09」会被浏览器清空,
     *    一保存就把这条日期删掉。原样留着并标出来才对。 */
    const eduStart = page.locator('[data-list="education"] .entry').first().locator('[data-k="startTime"]');
    ok('不合格日期原样显示', (await eduStart.inputValue()) === '2020.09');
    await page.locator('#btn-save').click();
    await page.waitForTimeout(200);
    let db = await page.evaluate(() => window.__db);
    ok('保存不吞掉不合格日期', db.profile.education.find((e) => e.school === '示例学院').startTime === '2020.09', db.profile.education);
    ok('页面不认识的字段保存后仍在', db.profile.futureField && db.profile.futureField.keep);
    ok('保存不吞掉不合格的出生日期', db.profile.basic.birthday === '2000.01.01', db.profile.basic);

    /* 2. 体检:缺月份、顺序、缺简历、缺手机 */
    const health = await page.locator('#health-list').innerText();
    ok('体检报出缺月份', /工作.*第 1 段.*结束时间.*缺月份/.test(health), health);
    ok('体检报出格式不对的日期', /教育.*第 1 段.*入学时间.*YYYY-MM/.test(health), health);
    ok('体检报出顺序不是倒序', /教育经历.*倒序/.test(health), health);
    ok('体检报出未上传简历', /简历附件/.test(health), health);
    ok('体检报出缺手机号', /手机号/.test(health), health);
    ok('体检报出出生日期格式', /出生日期.*YYYY-MM-DD/.test(health), health);

    // 点体检条目会跳到并聚焦那一栏
    await page.locator('#health-list li', { hasText: '缺月份' }).click();
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.dataset.k);
    ok('点体检条目聚焦到对应输入框', focused === 'endTime', { focused });

    /* 3. 排名换算成百分位提示 */
    const rankHint = await page.locator('[data-list="education"] .entry').first().locator('.rank-hint').innerText();
    ok('排名旁显示百分位', /前\s*10(\.0)?%/.test(rankHint), rankHint);

    /* 4. 上移:把硕士挪到第一段,顺序问题随之消失 */
    await page.locator('[data-list="education"] .entry').nth(1).locator('.entry-up').click();
    ok('上移后标题跟着走', (await page.locator('[data-list="education"] .entry').first().locator('.entry-title').innerText()).includes('示例大学'));
    await page.waitForTimeout(250);
    ok('改顺序后倒序告警消失', !/教育经历.*倒序/.test(await page.locator('#health-list').innerText()));

    /* 5. 未保存提示 + Ctrl/⌘+S */
    ok('有改动时出现未保存提示', await page.locator('#dirty').isVisible());
    const blocked = await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    ok('有改动时关页会拦', blocked);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
    await page.waitForTimeout(250);
    db = await page.evaluate(() => window.__db);
    ok('快捷键保存生效且顺序落盘', db.profile.education[0].school === '示例大学', db.profile.education);
    ok('保存后未保存提示消失', !(await page.locator('#dirty').isVisible()));

    /* 6. 删除有内容的段要确认;取消就不删 */
    await page.locator('[data-list="work"] .entry').first().locator('.entry-del').click();
    ok('删除前弹确认', dialogs.length === 1 && dialogs[0].type === 'confirm', dialogs);
    ok('取消确认不删除', (await page.locator('[data-list="work"] .entry').count()) === 1);

    /* 7. 导入前给出逐项段数对比,取消就什么都不改 */
    const backup = { profile: { basic: { fullName: '示例姓名' },
      education: [{ school: '示例大学' }], awards: [{ name: '示例奖学金' }, { name: '示例荣誉' }] } };
    const tmp = path.join(require('os').tmpdir(), 'rqf-import-test.json');
    fs.writeFileSync(tmp, JSON.stringify(backup));
    await page.locator('#btn-import').setInputFiles(tmp);
    await page.waitForTimeout(300);
    const imp = dialogs[dialogs.length - 1];
    ok('导入前弹确认', imp && imp.type === 'confirm' && dialogs.length === 2, dialogs);
    ok('确认框列出段数变化', /教育经历\s*2\s*→\s*1/.test(imp.msg) && /荣誉奖项.*0\s*→\s*2/.test(imp.msg), imp.msg);
    db = await page.evaluate(() => window.__db);
    ok('取消导入不改存储', db.profile.education.length === 2);
    acceptNext = true;
    await page.locator('#btn-import').setInputFiles(tmp);
    await page.waitForTimeout(300);
    db = await page.evaluate(() => window.__db);
    ok('确认导入后写入', db.profile.awards.length === 2 && db.profile.education.length === 1, db.profile);
    fs.unlinkSync(tmp);

    /* 8. 目录导航带段数 */
    const toc = await page.locator('#toc').innerText();
    ok('目录列出区块与段数', /教育经历\s*1/.test(toc) && /荣誉奖项[^\n]*2/.test(toc), toc);

    console.log(JSON.stringify({ pass: true, total: checks.length, checks }));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e.message || e); console.log(JSON.stringify({ pass: false })); process.exitCode = 1; });
