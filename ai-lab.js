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

async function check() {
  const st = await AI.availability();
  $('#status').textContent = STATUS[st] || `状态:${st}`;
  $('#prepare').hidden = !(st === 'downloadable' || st === 'downloading');
  setReady(st === 'available');
}

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

$('#run').addEventListener('click', async () => {
  $('#run').disabled = true;
  $('#copy').disabled = true;
  $('#summary').dataset.done = '0';
  $('#rows').innerHTML = '';
  try {
    if (!SESSION) SESSION = await AI.createSession();
    const t0 = performance.now();
    const all = [];
    const byForm = [];
    const trace = [];
    for (const [i, f] of window.rqfAIEval.entries()) {
      $('#summary').textContent = `正在识别第 ${i + 1}/${window.rqfAIEval.length} 组:${f.form}…`;
      const answers = await AI.resolveFields(SESSION, f.cases, { trace });
      const sc = AI.score(f.cases, answers);
      byForm.push({ form: f.form, right: sc.right, total: sc.total });
      for (const r of sc.rows) all.push({ ...r, form: f.form });
    }
    const ms = Math.round(performance.now() - t0);
    const res = {
      total: all.length,
      right: all.filter((r) => r.verdict === 'right').length,
      wrong: all.filter((r) => r.verdict === 'wrong').length,
      missed: all.filter((r) => r.verdict === 'missed').length,
      ms,
    };
    res.guarded = all.filter((r) => r.got && r.got.guarded).length;
    LAST = { res, rows: all, byForm, trace };
    $('#rows').innerHTML = all.map((r) => `<tr class="${r.verdict}"><td>${esc(r.form)}</td><td>${esc(r.label)}</td>`
      + `<td>${esc([r.section, r.group].filter(Boolean).join(' / '))}</td><td>${esc(show(r.expect, r.record === undefined ? -1 : r.record))}</td>`
      + `<td>${esc(show(r.got.key, r.got.record))}</td><td>${VERDICT[r.verdict]}</td></tr>`).join('');
    const pct = res.total ? Math.round((100 * res.right) / res.total) : 0;
    $('#summary').innerHTML = `<b>准确率 ${pct}%</b>(对 ${res.right} / 共 ${res.total})`
      + ` · <span class="lab-wrong">错填 ${res.wrong}</span> · 漏答 ${res.missed} · 用时 ${(ms / 1000).toFixed(1)} 秒`
      + `<br><span class="hint">其中 ${res.guarded} 个字段由硬规则直接判为不填(验证码 / 协议 / 是否题等),没有交给模型</span>`;
    $('#summary').dataset.result = JSON.stringify(res);
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
  const { res, rows, byForm, trace } = LAST;
  // 有漏答或错填的那几批,附上模型原始输出:分得清是截断还是理解错
  const badIds = new Set(rows.filter((r) => r.verdict !== 'right').map((r) => r.id));
  const raws = (trace || []).filter((t) => t.ids.some((i) => badIds.has(i))).slice(0, 8)
    .map((t) => `- 字段 ${t.ids.join(',')}:${t.raw || '(空)'}`);
  const line = (r) => `- [${r.form}] ${r.label}(${[r.section, r.group].filter(Boolean).join(' / ')}):`
    + `应为 ${show(r.expect, r.record === undefined ? -1 : r.record)},模型答 ${show(r.got.key, r.got.record)}`;
  const text = [
    '# 本机模型自测结果',
    navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0] || '',
    `准确率 ${res.total ? Math.round((100 * res.right) / res.total) : 0}%(对 ${res.right} / 共 ${res.total})· 错填 ${res.wrong} · 漏答 ${res.missed} · 用时 ${(res.ms / 1000).toFixed(1)} 秒 · 硬规则直接判不填 ${res.guarded}`,
    '', '## 分组', ...byForm.map((f) => `- ${f.form}:${f.right}/${f.total}`),
    '', '## 错填', ...(rows.filter((r) => r.verdict === 'wrong').map(line).concat(['(无)']).slice(0, Math.max(1, rows.filter((r) => r.verdict === 'wrong').length))),
    '', '## 漏答', ...(rows.filter((r) => r.verdict === 'missed').map(line).concat(['(无)']).slice(0, Math.max(1, rows.filter((r) => r.verdict === 'missed').length))),
    ...(raws.length ? ['', '## 有问题批次的原始输出', ...raws] : []),
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    $('#copy').textContent = '✓ 已复制';
    setTimeout(() => { $('#copy').textContent = '复制结果(发给维护者)'; }, 1200);
  } catch { $('#copy').textContent = '复制失败'; }
});

check();
