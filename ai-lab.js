/* 本机模型自测页:准备模型(首次下载必须由点击触发)→ 逐组识别 → 计分 → 复制结果 */
const $ = (s) => document.querySelector(s);
const AI = window.rqfAI;
let SESSION = null;
let LAST = null;

const STATUS = {
  'no-api': '这个浏览器不支持本机模型接口(需要较新的 Chrome 桌面版)。插件照常用规则填表,不受影响。',
  unavailable: '本机模型不可用:设备或系统条件不满足(内存、磁盘空间或显卡),或在 Chrome 设置里被关闭。可在 chrome://on-device-internals 查看原因。',
  downloadable: '本机模型还没下载(数 GB,只需一次,由 Chrome 自己管理)。点「准备模型」开始下载。',
  downloading: '本机模型正在下载。点「准备模型」查看进度,下载完即可运行。',
  available: '本机模型可用。',
};

function setReady(ready) {
  $('#run').disabled = !ready;
  if ($('#run-matrix')) $('#run-matrix').disabled = !ready || !isApi();
}

/* 选了 API 就不用本机模型那一套准备流程:有 Key 即可跑。 */
const provider = () => $('#provider').value;
const isApi = () => provider() !== 'local';

const apiCfg = (model) => ({ provider: provider(), endpoint: $('#api-endpoint').value.trim(),
  model: model || $('#api-model').value.trim(), apiKey: $('#api-key').value.trim() });
const setReadyAll = (ok) => { $('#run').disabled = !ok; $('#run-matrix').disabled = !ok; };

async function check() {
  // API 的输入框现在常显(只要填 Key 就能跑),只有本机模型那张卡随选择隐藏
  $('#local-card').hidden = isApi();
  if (isApi()) {
    const def = AI.API_PROVIDERS[provider()];
    if (!$('#api-model').value) $('#api-model').value = def.model;
    if (!$('#api-endpoint').value && def.endpoint) $('#api-endpoint').value = def.endpoint;
    $('#api-models').innerHTML = (def.models || []).map((m) => `<option value="${m}">`).join('');
    const c = apiCfg();
    const ok = !!(c.apiKey && c.endpoint);
    $('#api-state').textContent = ok ? `已就绪 · ${def.name}` : '把 Key 粘贴进来就能跑';
    setReady(ok);
    return;
  }
  const st = await AI.availability();
  $('#status').textContent = STATUS[st] || `状态:${st}`;
  $('#prepare').hidden = !(st === 'downloadable' || st === 'downloading');
  setReady(st === 'available');
}

$('#provider').addEventListener('change', check);
let saveTimer = null;
$('#api-key').addEventListener('input', () => {
  check();
  clearTimeout(saveTimer);                       // 停手 600ms 再存,别每敲一下写一次
  saveTimer = setTimeout(async () => {
    if (!$('#api-key').value.trim()) return;
    await AI.saveApiConfig(apiCfg());
    $('#api-state').textContent = '✓ 已存在本机 · ' + AI.API_PROVIDERS[provider()].name;
  }, 600);
});
$('#api-endpoint').addEventListener('input', check);

/* Key 存在 chrome.storage.local,和档案分开放,导出备份时不带它 */
/* 先自检再跑整套 —— 上一版 18 批全失败却照样汇报出一份「错填 0」的成绩单 */
$('#api-ping').addEventListener('click', async () => {
  $('#api-state').textContent = '自检中…';
  try {
    const r = await AI.pingApi({ ...apiCfg(), lang: 'zh' });
    $('#api-state').textContent = `✓ 通了(${r.ms}ms),模型把「姓名」认成 ${r.key};原话:${r.raw.slice(0, 80)}`;
  } catch (e) { $('#api-state').textContent = '✗ ' + ((e && e.message) || e); }
});

$('#api-clear').addEventListener('click', async () => {
  await AI.clearApiConfig();
  $('#api-key').value = '';
  await check();
  $('#api-state').textContent = '✓ 已清除';
});

// 不要在 create 之前 await 任何东西:首次下载必须发生在这次点击的用户手势里
$('#prepare').addEventListener('click', () => {
  $('#prepare').disabled = true;
  $('#progress').textContent = '准备中…';
  AI.createSession((p) => { $('#progress').textContent = `下载 ${Math.round((p || 0) * 100)}%`; })
    .then((s) => {
      SESSION = s;
      $('#status').textContent = '本机模型已就绪。';
      $('#progress').textContent = '';
      $('#prepare').hidden = true;
      setReady(true);
    })
    .catch((e) => {
      $('#progress').textContent = '准备失败:' + ((e && e.message) || e);
      $('#prepare').disabled = false;
    });
});

const esc = (s) => { const d = document.createElement('span'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };
const show = (key, record) => (key === 'none' ? 'none' : (record >= 0 ? `${key} #${record + 1}` : key));
const VERDICT = { right: '✅ 对', wrong: '❌ 错填', missed: '⚪️ 漏答' };

const LANGS = [['zh', '中文提示'], ['en', '英文提示']];
const pct = (r) => (r.total ? Math.round((100 * r.right) / r.total) : 0);
const line1 = (name, r) => `${name}:准确率 ${pct(r)}%(对 ${r.right} / 共 ${r.total})· 错填 ${r.wrong} · 漏答 ${r.missed}`
  + (r.failed ? ` · 调用失败 ${r.failed}` : '') + ` · 用时 ${(r.ms / 1000).toFixed(1)} 秒`;

/* 中文提示和英文提示各跑一遍 —— 官方没声明支持中文,能不能用直接量 */
async function makeSession(lang, first, model) {
  if (!isApi()) return first && SESSION ? SESSION : AI.createSession(null, lang);
  return AI.createApiSession({ ...apiCfg(model), lang,
    onWait: ({ attempt, ms }) => { $('#summary').textContent =
      `被网关限流(配额 10 次/窗口),第 ${attempt} 次等待 ${Math.round(ms / 1000)} 秒后重试…`; } });
}

/* 跑一遍 = 把 71 题问一轮。同一批回答按两种方式各算一次分:
 * 含段号 / 段号交给引擎算 —— 不多花一次调用,却能分清模型是认错栏位
 * 还是只数错段号(本机 Nano 那一轮 37 个错填里 26 个只是段号错)。 */
async function runPass(lang, { model, first } = {}) {
  const session = await makeSession(lang, first, model);
  const chunk = Math.max(1, Math.min(24, Number($('#chunk').value) || 8));
  const t0 = performance.now();
  const trace = [], answers = new Map(), cases = [], formOf = new Map();
  const label = `${model || (isApi() ? $('#api-model').value : '本机')} · ${lang === 'zh' ? '中文' : '英文'}提示`;
  for (const [i, f] of window.rqfAIEval.entries()) {
    $('#summary').textContent = `${label}:第 ${i + 1}/${window.rqfAIEval.length} 组 —— ${f.form}…`;
    const got = await AI.resolveFields(session, f.cases, { chunk, trace });
    for (const c of f.cases) { cases.push(c); formOf.set(c.id, f.form); answers.set(c.id, got.get(c.id)); }
  }
  const ms = Math.round(performance.now() - t0);
  const tally = (ignoreRecord) => {
    const sc = AI.score(cases, answers, { ignoreRecord });
    const rows = sc.rows.map((r) => ({ ...r, form: formOf.get(r.id) }));
    const failed = rows.filter((r) => r.got && r.got.failed);
    return { rows, total: sc.total, right: sc.right, wrong: sc.wrong, missed: sc.missed, ms,
      failed: failed.length, failedWhy: failed[0] ? failed[0].got.failed : '',
      guarded: rows.filter((r) => r.got && r.got.guarded).length };
  };
  const byForm = window.rqfAIEval.map((f) => {
    const sc = AI.score(f.cases, answers, { ignoreRecord: false });
    return { form: f.form, right: sc.right, total: sc.total };
  });
  return { label, lang, model: model || '', withRecord: tally(false), noRecord: tally(true), byForm, trace };
}

/* 兼容原来的单轮入口:默认按高级设置里的勾选决定用哪种计分展示 */
async function runOnce(lang, first) {
  const p = await runPass(lang, { first });
  const pick = $('#ignore-record').checked ? p.noRecord : p.withRecord;
  return { res: pick, rows: pick.rows, byForm: p.byForm, trace: p.trace, pass: p };
}

$('#run').addEventListener('click', async () => {
  $('#run').disabled = true;
  $('#copy').disabled = true;
  $('#summary').dataset.done = '0';
  $('#rows').innerHTML = '';
  MATRIX = null;
  try {
    const out = {};
    for (const [i, [lang]] of LANGS.entries()) out[lang] = await runOnce(lang, i === 0);
    LAST = out;
    const byId = (lang) => new Map(out[lang].rows.map((r) => [r.id, r]));
    const zh = byId('zh'), en = byId('en');
    $('#rows').innerHTML = out.zh.rows.map((r) => {
      const e = en.get(r.id);
      const cls = r.verdict === 'wrong' || e.verdict === 'wrong' ? 'wrong' : (r.verdict === 'right' && e.verdict === 'right' ? 'right' : 'missed');
      return `<tr class="${cls}"><td>${esc(r.form)}</td><td>${esc(r.label)}</td>`
        + `<td>${esc([r.section, r.group].filter(Boolean).join(' / '))}</td><td>${esc(show(r.expect, r.record === undefined ? -1 : r.record))}</td>`
        + `<td>${VERDICT[r.verdict]} ${esc(show(r.got.key, r.got.record))}</td><td>${VERDICT[e.verdict]} ${esc(show(e.got.key, e.got.record))}</td></tr>`;
    }).join('');
    const bad = LANGS.map(([l]) => out[l].res).find((r) => r.failed);
    $('#summary').innerHTML = (bad ? `<div class="lab-fail"><b>⚠️ ${bad.failed}/${bad.total} 个字段的调用失败了,这份成绩不代表模型水平。</b><br>第一个错误:${esc(bad.failedWhy)}</div>` : '')
      + LANGS.map(([lang, name]) => `<div><b>${esc(line1(name, out[lang].res))}</b></div>`).join('')
      + `<div class="hint">两种提示各有 ${out.zh.res.guarded} 个字段由硬规则直接判为不填(验证码 / 协议 / 是否题等),没有交给模型</div>`;
    $('#summary').dataset.result = JSON.stringify({ zh: out.zh.res, en: out.en.res });
    $('#summary').dataset.done = '1';
    $('#copy').disabled = false;
  } catch (e) {
    $('#summary').textContent = '运行失败:' + ((e && e.message) || e);
  } finally {
    $('#run').disabled = false;
  }
});

const MATRIX_MODELS = ['deepseek-chat', 'qwen3.8-27b'];
const LANGS_OF = () => ($('#zh-only').checked ? ['zh'] : ['zh', 'en']);
/* 配额只有 10 次请求,得让用户跑之前就知道要花多少 */
function budget() {
  /* 请求是按【表单分组】发的(每组一次 resolveFields),不是把 71 个字段整体切批 ——
   * 所以每轮至少 7 次(7 组),调大批量只能减少组内的切分,减不到 7 以下。
   * 第一版按 ceil(总字段/批量) 估成 3 次,实际 7 次,差了一倍多。 */
  const chunk = Math.max(1, Math.min(40, Number($('#chunk').value) || 24));
  const per = window.rqfAIEval.reduce((n, f) =>
    n + Math.ceil(Math.max(1, f.cases.filter((c) => !AI.guarded(c)).length) / chunk), 0);
  const n = per * MATRIX_MODELS.length * LANGS_OF().length + 1;   // +1 = 连通性自检
  $('#budget').textContent = `按当前设置:每轮 ${per} 次请求(按表单分 ${window.rqfAIEval.length} 组发)`
    + ` × ${MATRIX_MODELS.length} 个模型 × ${LANGS_OF().length} 种提示 + 1 次自检 = 共 ${n} 次请求。`
    + (n > 10 ? ` 网关配额 10 次/窗口,超出部分会自动等配额重置后继续 —— 预计要等 ${Math.ceil(n / 10) - 1} 轮配额。`
      : ' 在配额内,一次跑完。');
}
$('#chunk').addEventListener('input', budget);
$('#zh-only').addEventListener('change', budget);
let MATRIX = null;
const BAR = (r) => r.wrong === 0 && pct(r) >= 85;   // 门槛:错填 0 且准确率 ≥85%

$('#run-matrix').addEventListener('click', async () => {
  $('#run-matrix').disabled = true; $('#run').disabled = true; $('#copy').disabled = true;
  $('#matrix').innerHTML = ''; $('#rows').innerHTML = ''; $('#summary').dataset.done = '0';
  try {
    // 先自检:上一版 18 批全失败却照样出成绩单,不能再发生
    $('#summary').textContent = '连通性自检…';
    await AI.pingApi({ ...apiCfg(MATRIX_MODELS[0]), lang: 'zh' });

    const passes = [];
    for (const model of MATRIX_MODELS) {
      for (const lang of LANGS_OF()) passes.push(await runPass(lang, { model }));
    }
    MATRIX = passes;
    const cell = (r) => `<td class="${BAR(r) ? 'pass' : 'fail'}">${pct(r)}% · 错填 ${r.wrong}${r.failed ? ` · 失败 ${r.failed}` : ''}</td>`;
    $('#matrix').innerHTML = '<table class="lab-matrix"><thead><tr><th>模型</th><th>提示语</th>'
      + '<th>含段号</th><th>段号交给引擎算</th><th>漏答</th><th>用时</th></tr></thead><tbody>'
      + passes.map((p) => `<tr><td>${esc(p.model)}</td><td>${p.lang === 'zh' ? '中文' : '英文'}</td>`
        + cell(p.withRecord) + cell(p.noRecord)
        + `<td>${p.withRecord.missed}</td><td>${(p.withRecord.ms / 1000).toFixed(1)}s</td></tr>`).join('')
      + '</tbody></table>';
    const best = passes.map((p) => p.noRecord).sort((a, b) => (a.wrong - b.wrong) || (pct(b) - pct(a)))[0];
    const bad = passes.map((p) => p.withRecord).find((r) => r.failed);
    $('#summary').innerHTML = (bad ? `<div class="lab-fail"><b>⚠️ 有 ${bad.failed} 个字段调用失败,这份成绩不代表模型水平。</b><br>${esc(bad.failedWhy)}</div>` : '')
      + `<div><b>${passes.some((p) => BAR(p.noRecord)) ? '✅ 有配置过了门槛(错填 0 且 ≥85%)' : '❌ 没有配置过门槛 —— 最好的一档是错填 ' + best.wrong + '、准确率 ' + pct(best) + '%'}</b></div>`
      + '<div class="hint">绿色=过门槛。「段号交给引擎算」那一列才是真正该看的:段号本来就是引擎的活。</div>';
    // 逐字段表格展示最强的那一轮;表头原来写着「中文提示 / 英文提示」,这里只有一轮
    const show1 = passes.find((p) => p.noRecord === best) || passes[0];
    document.querySelector('.lab-table thead tr').innerHTML =
      '<th>表单</th><th>标签</th><th>模块 / 组</th><th>正确答案</th><th colspan="2">'
      + esc(`${show1.model} · ${show1.lang === 'zh' ? '中文' : '英文'}提示(段号交给引擎算)`) + '</th>';
    $('#rows').innerHTML = show1.noRecord.rows.map((r) => `<tr class="${r.verdict}">`
      + `<td>${esc(r.form)}</td><td>${esc(r.label)}</td>`
      + `<td>${esc([r.section, r.group].filter(Boolean).join(' / '))}</td>`
      + `<td>${esc(show(r.expect, r.record === undefined ? -1 : r.record))}</td>`
      + `<td colspan="2">${VERDICT[r.verdict]} ${esc(show(r.got.key, r.got.record))}</td></tr>`).join('');
    $('#summary').dataset.done = '1';
    $('#copy').disabled = false;
  } catch (e) {
    $('#summary').innerHTML = `<div class="lab-fail"><b>跑不动:</b>${esc((e && e.message) || e)}</div>`;
  } finally { await check(); }
});

/* 给维护者的摘要:只有评测集里的标签和模型答案,不含任何个人信息 */
$('#copy').addEventListener('click', async () => {
  if (MATRIX) {
    const parts = ['# 字段识别自测 · 整套对比', navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0] || '',
      `端点 ${AI.API_PROVIDERS[provider()].name} · 每批 ${$('#chunk').value} 个字段`, '',
      '| 模型 | 提示语 | 含段号 | 段号交给引擎算 | 漏答 | 用时 |', '| --- | --- | --- | --- | --- | --- |'];
    for (const p of MATRIX) parts.push(`| ${p.model} | ${p.lang === 'zh' ? '中文' : '英文'} `
      + `| ${pct(p.withRecord)}% 错填 ${p.withRecord.wrong} | ${pct(p.noRecord)}% 错填 ${p.noRecord.wrong} `
      + `| ${p.withRecord.missed} | ${(p.withRecord.ms / 1000).toFixed(1)}s |`);
    const line = (r) => `- [${r.form}] ${r.label}(${[r.section, r.group].filter(Boolean).join(' / ')}):`
      + `应为 ${show(r.expect, r.record === undefined ? -1 : r.record)},模型答 ${show(r.got.key, r.got.record)}`;
    for (const p of MATRIX) {
      const r = p.noRecord;
      parts.push('', `## ${p.model} · ${p.lang === 'zh' ? '中文' : '英文'}提示(段号交给引擎算)`,
        `准确率 ${pct(r)}% · 错填 ${r.wrong} · 漏答 ${r.missed}` + (r.failed ? ` · 调用失败 ${r.failed}:${r.failedWhy}` : ''),
        '### 分组', ...p.byForm.map((f) => `- ${f.form}:${f.right}/${f.total}`),
        '### 错填(真·认错栏位)', ...(r.rows.filter((x) => x.verdict === 'wrong').map(line).length
          ? r.rows.filter((x) => x.verdict === 'wrong').map(line) : ['(无)']),
        '### 漏答', ...(r.rows.filter((x) => x.verdict === 'missed').map(line).length
          ? r.rows.filter((x) => x.verdict === 'missed').map(line) : ['(无)']));
    }
    try { await navigator.clipboard.writeText(parts.join('\n'));
      $('#copy').textContent = '✓ 已复制'; setTimeout(() => { $('#copy').textContent = '复制结果(发给维护者)'; }, 1200);
    } catch { $('#copy').textContent = '复制失败'; }
    return;
  }
  if (!LAST) return;
  const who = isApi() ? `${AI.API_PROVIDERS[provider()].name} / ${$('#api-model').value.trim() || AI.API_PROVIDERS[provider()].model}`
    : '本机 Gemini Nano';
  const parts = [`# 字段识别自测结果(${who})`, navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0] || '',
    `每批 ${$('#chunk').value} 个字段 · 计分${$('#ignore-record').checked ? '忽略段号(只看栏位)' : '含段号'}`];
  for (const [lang, name] of LANGS) {
    const { res, rows, byForm, trace } = LAST[lang];
    const line = (r) => `- [${r.form}] ${r.label}(${[r.section, r.group].filter(Boolean).join(' / ')}):`
      + `应为 ${show(r.expect, r.record === undefined ? -1 : r.record)},模型答 ${show(r.got.key, r.got.record)}`;
    const list = (v) => { const xs = rows.filter((r) => r.verdict === v).map(line); return xs.length ? xs : ['(无)']; };
    const badIds = new Set(rows.filter((r) => r.verdict !== 'right').map((r) => r.id));
    const raws = (trace || []).filter((t) => t.ids.some((i) => badIds.has(i))).slice(0, 8)
      .map((t) => `- 字段 ${t.ids.join(',')}:${t.raw || '(空)'}`);
    parts.push('', `## ${name}`, line1(name, res) + ` · 硬规则直接判不填 ${res.guarded}`,
      '### 分组', ...byForm.map((f) => `- ${f.form}:${f.right}/${f.total}`),
      '### 错填', ...list('wrong'), '### 漏答', ...list('missed'),
      ...(raws.length ? ['### 有问题批次的原始输出', ...raws] : []));
  }
  try {
    await navigator.clipboard.writeText(parts.join('\n'));
    $('#copy').textContent = '✓ 已复制';
    setTimeout(() => { $('#copy').textContent = '复制结果(发给维护者)'; }, 1200);
  } catch { $('#copy').textContent = '复制失败'; }
});

(async () => {
  const cfg = await AI.loadApiConfig();
  if (cfg && cfg.provider) {
    $('#provider').value = cfg.provider;
    if (cfg.model) $('#api-model').value = cfg.model;
    if (cfg.apiKey) $('#api-key').value = cfg.apiKey;
  }
  await check();
  budget();
})();
