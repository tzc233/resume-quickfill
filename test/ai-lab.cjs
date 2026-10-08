/* 本机模型自测页(ai-lab.html)的流程与计分。真实的 Gemini Nano 在无头浏览器里没有,
 * 这里在页面脚本之前注入一个假的 LanguageModel:它照评测集的标准答案作答,但故意
 *   · 把「所在单位」答成 work.company(错填,模拟最要紧的那类错误);
 *   · 把「微信号」答成表里没有的 basic.weixin(非法键,必须当 none 处理 → 漏答);
 *   · 把「专利成果」答成 none(漏答)。
 * 于是总数、对、错填、漏答都是确定的,可以精确断言。 */
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const {chromium} = require(process.env.RQF_PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '..');

const open = async (browser, state) => {
  const page = await browser.newPage();
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== 'http://rqf.test') return route.abort();
    const file = path.resolve(root, '.' + u.pathname);
    const type = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
    return route.fulfill({ body: fs.readFileSync(file), contentType: type });
  });
  await page.addInitScript((state) => {
    window.__log = { creates: 0, prompts: [], clones: 0, gesture: [] };
    // 测试页的源不是安全上下文,没有 navigator.clipboard;扩展页面里有。这里给一个假的
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      async writeText(t) { window.__clip = t; }, async readText() { return window.__clip || ''; } } });
    const answerFor = (f) => {
      if (f.label === '所在单位') return { key: 'work.company', record: 0 };
      if (f.label === '微信号') return { key: 'basic.weixin', record: -1 };
      if (f.label === '专利成果') return { key: 'none', record: -1 };
      const c = window.rqfAIEval.flatMap((x) => x.cases).find((x) => x.id === f.id);
      return { key: c.expect, record: c.record === undefined ? -1 : c.record };
    };
    const session = {
      async clone() { window.__log.clones++; return session; },
      destroy() {},
      async prompt(text, opts) {
        window.__log.prompts.push({ text, schema: opts && opts.responseConstraint });
        const fields = text.split('\n').slice(1).map((l) => JSON.parse(l));
        return JSON.stringify({ answers: fields.map((f) => ({ id: f.id, ...answerFor(f) })) });
      },
    };
    window.LanguageModel = {
      async availability() { return state; },
      async create(opts) {
        window.__log.creates++;
        window.__log.gesture.push(navigator.userActivation ? navigator.userActivation.isActive : null);
        window.__log.system = opts.initialPrompts && opts.initialPrompts[0].content;
        if (opts.monitor) opts.monitor({ addEventListener(_, fn) { fn({ loaded: 1 }); } });
        return session;
      },
    };
  }, state);
  await page.goto('http://rqf.test/ai-lab.html');
  await page.waitForTimeout(200);
  return page;
};

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const checks = [];
  const ok = (name, cond, extra) => { assert(cond, name + (extra ? ' :: ' + JSON.stringify(extra) : '')); checks.push(name); };
  try {
    // 1. 模型需要下载:先显示「准备模型」,不点就不 create(下载必须由用户点击触发)
    let page = await open(browser, 'downloadable');
    ok('需要下载时提示准备模型', await page.locator('#prepare').isVisible()
      && /下载/.test(await page.locator('#status').innerText()));
    ok('不点击不触发下载', (await page.evaluate(() => window.__log.creates)) === 0);
    ok('没准备好时不能跑自测', await page.locator('#run').isDisabled());
    await page.locator('#prepare').click();
    await page.waitForTimeout(150);
    const log0 = await page.evaluate(() => window.__log);
    ok('点击后才创建会话且在用户手势里', log0.creates === 1 && log0.gesture[0] !== false, log0.gesture);
    ok('准备好后可以跑', !(await page.locator('#run').isDisabled()));
    await page.close();

    // 2. 没有接口 / 不可用:说清楚原因
    page = await open(browser, 'unavailable');
    ok('不可用时说明原因', /不可用|不支持/.test(await page.locator('#status').innerText())
      && !(await page.locator('#prepare').isVisible()));
    await page.close();

    // 3. 已可用:跑一遍,核对计分
    page = await open(browser, 'available');
    await page.locator('#prepare').click().catch(() => {});
    await page.locator('#run').click();
    await page.waitForFunction(() => document.querySelector('#summary').dataset.done === '1', null, { timeout: 30000 });
    const total = await page.evaluate(() => window.rqfAIEval.reduce((n, f) => n + f.cases.length, 0));
    const sum = await page.evaluate(() => JSON.parse(document.querySelector('#summary').dataset.result));
    ok('覆盖全部评测字段', sum.total === total, sum);
    ok('错填计数对(所在单位被答成工作单位)', sum.wrong === 1, sum);
    ok('非法键当 none、none 记漏答', sum.missed === 2, sum);
    ok('其余全对', sum.right === total - 3, sum);
    const wrongRow = await page.locator('tr.wrong').first().innerText();
    ok('错填一行写清标签与两边答案', /所在单位/.test(wrongRow) && /work\.company/.test(wrongRow) && /none/.test(wrongRow), wrongRow);

    const log = await page.evaluate(() => window.__log);
    ok('分批提问,每批不超过 4 个字段', log.prompts.every((p) => p.text.split('\n').length - 1 <= 4));
    // 硬规则先拦:这些字段插件本来就不填,不许交给模型
    const sent = log.prompts.map((p) => p.text).join('\n');
    ok('验证码 / 协议 / 紧急联系人 / 是否题不交给模型', !/短信验证码|隐私政策|紧急联系人|是否为工商银行员工|内推人/.test(sent));
    ok('被拦下的字段计为不填且标出来', /硬规则直接判为不填/.test(await page.locator('#summary').innerText()));
    ok('每批从基础会话克隆,互不串话', log.clones === log.prompts.length);
    ok('输出被 JSON Schema 锁定到档案栏目', log.prompts.every((p) => p.schema
      && p.schema.properties.answers.items.properties.key.enum.includes('none')
      && p.schema.properties.answers.items.properties.key.enum.includes('awards.name')));
    ok('系统提示要求拿不准就答 none', /none/.test(log.system) && /Never guess/.test(log.system));

    // 4. 复制结果:给维护者看的摘要,不含任何值
    await page.locator('#copy').click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    ok('复制结果含准确率与错填清单', /准确/.test(copied) && /错填/.test(copied) && /所在单位/.test(copied), copied.slice(0, 200));
    ok('复制结果附有问题批次的原始输出', /原始输出/.test(copied) && /work\.company/.test(copied.split('原始输出')[1] || ''));
    await page.close();

    // 5. 发给模型的只有标签结构:字段带了值也不许出现在提示里
    page = await open(browser, 'available');
    const leaked = await page.evaluate(() => window.rqfAI.buildPrompt([{ id: 1, label: '姓名', section: '基本信息', group: '', value: '示例机密值', profileValue: '示例档案值' }]));
    ok('提示里不带页面值与档案值', !/示例机密值|示例档案值/.test(leaked) && /姓名/.test(leaked), leaked);
    const bad = await page.evaluate(() => {
      const fields = [{ id: 7, label: 'x' }, { id: 8, label: 'y' }];
      const m = window.rqfAI.validate('{"answers":[{"id":7,"key":"education.school","record":-1},{"id":99,"key":"basic.phone","record":-1},{"id":8,"key":"basic.phone","record":3}]}', fields);
      return [m.get(7), m.get(8), m.has(99)];
    });
    ok('列表栏没段号当 none', bad[0].key === 'none', bad);
    ok('非本批 id 丢弃、非列表栏段号归 -1', bad[2] === false && bad[1].key === 'basic.phone' && bad[1].record === -1, bad);
    ok('坏 JSON 全部当 none', await page.evaluate(() => [...window.rqfAI.validate('not json', [{ id: 1 }]).values()][0].key === 'none'));
    await page.close();

    console.log(JSON.stringify({ pass: true, total: checks.length, checks }));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e.message || e); console.log(JSON.stringify({ pass: false })); process.exitCode = 1; });
