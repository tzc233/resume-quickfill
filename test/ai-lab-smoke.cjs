/* 真打开 ai-lab.html,桩掉 fetch 与 chrome.storage,点「一键跑完整套对比」。
   验的是界面真的能跑通、矩阵真的出四行、Key 真的自动存。 */
const { chromium } = require(process.env.RQF_PLAYWRIGHT);
const fs = require('fs'), path = require('path');
const ROOT = process.cwd();
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.route('http://rqf.test/**', r => {
    const f = path.join(ROOT, new URL(r.request().url()).pathname);
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    const ext = path.extname(f);
    const t = ext === '.html' ? 'text/html' : ext === '.css' ? 'text/css' : 'application/javascript';
    r.fulfill({ status: 200, contentType: t + '; charset=utf-8', body: fs.readFileSync(f) });
  });
  await p.addInitScript(() => {
    const mem = {};
    window.chrome = { storage: { local: {
      async get(k) { return { [k]: mem[k] }; }, async set(v) { Object.assign(mem, v); },
      async remove(k) { delete mem[k]; } } } };
    window.__calls = 0;
    window.fetch = async (url, init) => {
      window.__calls++;
      const body = JSON.parse(init.body);
      const ids = (body.messages[1].content.match(/"id":(\d+)/g) || []).map(x => +x.split(':')[1]);
      // 假模型:一半答对键、段号故意全写 0,用来验「两种计分」确实不同
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
        answers: ids.map(id => ({ id, key: id % 2 ? 'education.school' : 'none', record: 0 })) }) } }] }) };
    };
    window.LanguageModel = undefined;
  });
  await p.goto('http://rqf.test/ai-lab.html');
  await p.waitForSelector('#api-key');
  const beforeDisabled = await p.$eval('#run-matrix', e => e.disabled);
  await p.fill('#api-key', 'sk-fake-smoke-key');
  await p.waitForTimeout(800);                       // 等自动保存
  const saved = await p.evaluate(async () => (await window.rqfAI.loadApiConfig())?.apiKey);
  const endpoint = await p.$eval('#api-endpoint', e => e.value);
  const afterDisabled = await p.$eval('#run-matrix', e => e.disabled);
  await p.click('#run-matrix');
  await p.waitForSelector('#summary[data-done="1"]', { timeout: 120000 });
  const rows = await p.$$eval('.lab-matrix tbody tr', rs => rs.map(r => r.innerText.replace(/\s+/g, ' ')));
  const calls = await p.evaluate(() => window.__calls);
  const fieldRows = await p.$$eval('#rows tr', rs => rs.length);
  const copyEnabled = await p.$eval('#copy', e => !e.disabled);
  await b.close();
  const checks = {
    没填Key时不能跑: beforeDisabled === true,
    填了Key就能跑: afterDisabled === false,
    Key自动存下来了: saved === 'sk-fake-smoke-key',
    端点已预填为交大网关: endpoint === 'https://models.sjtu.edu.cn/api/v1/chat/completions',
    矩阵出了四行: rows.length === 4,
    四行是两模型各中英: rows.filter(r => r.includes('deepseek-chat')).length === 2
      && rows.filter(r => r.includes('qwen3.8-27b')).length === 2,
    两种计分结果不同: rows.every(r => { const m = r.match(/错填 (\d+)/g); return m && m[0] !== m[1]; }),
    逐字段表格有内容: fieldRows === 71,
    复制按钮已启用: copyEnabled === true,
    没有页面报错: errs.length === 0,
  };
  const fails = Object.keys(checks).filter(k => !checks[k]);
  console.log(JSON.stringify({ pass: !fails.length, fails, matrix: rows, apiCalls: calls, errs }, null, 1));
  process.exit(fails.length ? 1 : 0);
})();
