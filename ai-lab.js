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
}

/* 选了 API 就不用本机模型那一套准备流程:有 Key 即可跑。 */
const provider = () => $('#provider').value;
const isApi = () => provider() !== 'local';

async function check() {
  $('#api-box').hidden = !isApi();
  $('#local-card').hidden = isApi();
  if (isApi()) {
    const def = AI.API_PROVIDERS[provider()];
    if (!$('#api-model').value) $('#api-model').value = def.model;
    const ok = !!$('#api-key').value.trim();
    $('#api-state').textContent = ok ? `已填 Key,将调用 ${def.name}` : '填入 Key 后才能运行';
    setReady(ok);
    return;
  }
  const st = await AI.availability();
  $('#status').textContent = STATUS[st] || `状态:${st}`;
  $('#prepare').hidden = !(st === 'downloadable' || st === 'downloading');
  setReady(st === 'available');
}

$('#provider').addEventListener('change', check);
$('#api-key').addEventListener('input', check);

/* Key 存在 chrome.storage.local,和档案分开放,导出备份时不带它 */
$('#api-save').addEventListener('click', async () => {
  const cfg = { provider: provider(), model: $('#api-model').value.trim(), apiKey: $('#api-key').value.trim() };
  $('#api-state').textContent = (await AI.saveApiConfig(cfg)) ? '✓ 已保存到本机' : '保存失败';
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
const line1 = (name, r) => `${name}:准确率 ${pct(r)}%(对 ${r.right} / 共 ${r.total})· 错填 ${r.wrong} · 漏答 ${r.missed} · 用时 ${(r.ms / 1000).toFixed(1)} 秒`;

/* 中文提示和英文提示各跑一遍 —— 官方没声明支持中文,能不能用直接量 */
async function makeSession(lang, first) {
  if (!isApi()) return first && SESSION ? SESSION : AI.createSession(null, lang);
  return AI.createApiSession({ provider: provider(), model: $('#api-model').value.trim(),
    apiKey: $('#api-key').value.trim(), lang });
}

async function runOnce(lang, first) {
  const session = await makeSession(lang, first);
  const chunk = Math.max(1, Math.min(24, Number($('#chunk').value) || 4));
  const ignoreRecord = $('#ignore-record').checked;
  const t0 = performance.now();
  const rows = [], byForm = [], trace = [];
  for (const [i, f] of window.rqfAIEval.entries()) {
    $('#summary').textContent = `${lang === 'zh' ? '中文' : '英文'}提示:正在识别第 ${i + 1}/${window.rqfAIEval.length} 组 —— ${f.form}…`;
    const answers = await AI.resolveFields(session, f.cases, { chunk, trace });
    const sc = AI.score(f.cases, answers, { ignoreRecord });
    byForm.push({ form: f.form, right: sc.right, total: sc.total });
    for (const r of sc.rows) rows.push({ ...r, form: f.form });
  }
  const res = { total: rows.length, right: rows.filter((r) => r.verdict === 'right').length,
    wrong: rows.filter((r) => r.verdict === 'wrong').length, missed: rows.filter((r) => r.verdict === 'missed').length,
    guarded: rows.filter((r) => r.got && r.got.guarded).length, ms: Math.round(performance.now() - t0) };
  return { res, rows, byForm, trace };
}

$('#run').addEventListener('click', async () => {
  $('#run').disabled = true;
  $('#copy').disabled = true;
  $('#summary').dataset.done = '0';
  $('#rows').innerHTML = '';
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
    $('#summary').innerHTML = LANGS.map(([lang, name]) => `<div><b>${esc(line1(name, out[lang].res))}</b></div>`).join('')
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

/* 给维护者的摘要:只有评测集里的标签和模型答案,不含任何个人信息 */
$('#copy').addEventListener('click', async () => {
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
})();
