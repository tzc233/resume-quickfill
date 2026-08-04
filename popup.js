/* 弹窗逻辑:按需注入 content.js 并汇总各 frame 的填充报告 */
const $ = (s) => document.querySelector(s);
const getPath = (o, p) => p.split('.').reduce((a, k) => (a ? a[k] : undefined), o);

const CHIPS = [
  ['姓名', 'basic.fullName'], ['手机', 'basic.phone'], ['邮箱', 'basic.email'], ['微信', 'basic.wechat'],
  ['现居城市', 'basic.city'], ['期望城市', 'basic.expectedCity'], ['期望薪资', 'basic.expectedSalary'],
  ['学校', 'education.school'], ['专业', 'education.major'], ['学历', 'education.degree'],
  ['公司', 'work.company'], ['职位', 'work.title'],
  ['GitHub', 'links.github'], ['主页', 'links.homepage'], ['LinkedIn', 'links.linkedin'], ['自我介绍', 'intro'],
];

function esc(s) { const d = document.createElement('span'); d.textContent = s ?? ''; return d.innerHTML; }

function renderChips(profile) {
  const wrap = $('#chips');
  wrap.innerHTML = '';
  let n = 0;
  for (const [label, path] of CHIPS) {
    const v = String(getPath(profile || {}, path) || '').trim();
    if (!v) continue;
    n++;
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = label;
    b.title = v.length > 120 ? v.slice(0, 120) + '…' : v;
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(v);
        b.textContent = '✓ 已复制';
        setTimeout(() => { b.textContent = label; }, 900);
      } catch { b.textContent = '复制失败'; }
    });
    wrap.appendChild(b);
  }
  if (!n) wrap.innerHTML = '<div class="hint">档案为空 — 点击右上角「⚙️ 档案」填写后,这里会出现一键复制按钮。</div>';
}

function renderReport(a) {
  const li = (arr, f) => arr.slice(0, 60).map(f).join('');
  let h = '';
  if (a.filled.length || a.fileFilled) {
    h += `<details open><summary>已填充(${a.filled.length + (a.fileFilled ? 1 : 0)})</summary>`
      + li(a.filled, (x) => `<div class="row ok"><span>${esc(x.label)}</span><em>${esc(x.value)}</em></div>`)
      + (a.fileFilled ? `<div class="row ok"><span>📎 简历附件</span><em>已注入 ${esc(a.fileLabel)}</em></div>` : '')
      + '</details>';
  }
  if (a.skipped.length) {
    h += `<details><summary>已跳过(${a.skipped.length})</summary>`
      + li(a.skipped, (x) => `<div class="row"><span>${esc(x.label)}</span><em>${esc(x.reason)}</em></div>`)
      + '</details>';
  }
  if (a.unmatched.length) {
    h += `<details><summary>未识别(${a.unmatched.length})— 可用下方按钮复制后手动粘贴</summary>`
      + li(a.unmatched, (x) => `<div class="row"><span>${esc(x.label)}</span></div>`)
      + '</details>';
  }
  if (!h) h = '<div class="hint">页面上没有发现可识别的表单字段。若表单在弹窗/iframe 中,请先让它显示出来再点填充。</div>';
  return h;
}

async function doFill() {
  const status = $('#status'), res = $('#result');
  res.innerHTML = '';
  let tab;
  try { [tab] = await rqfApi.tabs.query({ active: true, currentWindow: true }); } catch { }
  if (!tab || !/^https?:/i.test(tab.url || '')) {
    status.textContent = '当前页面不支持注入(仅支持 http/https 页面)。';
    return;
  }
  // Firefox MV3 把 host_permissions 当可选权限,没授权时 executeScript 会抛难懂的错
  if (!(await window.rqfEnsureHost())) {
    status.textContent = window.rqfNoHostMessage();
    return;
  }
  status.textContent = '正在识别并填充表单…';

  const run = async (allFrames) => {
    await rqfApi.scripting.executeScript({ target: { tabId: tab.id, allFrames }, files: ['content.js'] });
    return rqfApi.scripting.executeScript({
      target: { tabId: tab.id, allFrames },
      // 注意:func 体在页面的内容脚本环境执行,拿不到弹窗里的适配层,须就地解析命名空间
      func: async () => {
        const ext = (typeof browser !== 'undefined' && browser.storage) ? browser : chrome;
        try {
          const st = await ext.storage.local.get(['profile', 'resumeFile']);
          if (!st.profile) return { error: 'NO_PROFILE' };
          if (!window.__RQF) return { error: 'NO_ENGINE' };
          return window.__RQF.fill(st.profile, st.resumeFile || null);
        } catch (e) { return { error: String((e && e.message) || e) }; }
      },
    });
  };

  let results;
  try { results = await run(true); }
  catch {
    try { results = await run(false); }
    catch (e2) { status.textContent = '注入失败:' + ((e2 && e2.message) || e2); return; }
  }

  const agg = { filled: [], skipped: [], unmatched: [], expanded: [], fileFilled: false, fileLabel: '' };
  let noProfile = false;
  for (const r of results || []) {
    const v = r && r.result;
    if (!v) continue;
    if (v.error === 'NO_PROFILE') { noProfile = true; continue; }
    if (v.error) continue;
    agg.filled.push(...(v.filled || []));
    agg.skipped.push(...(v.skipped || []));
    agg.unmatched.push(...(v.unmatched || []));
    agg.expanded.push(...(v.expanded || []));
    if (v.fileFilled) { agg.fileFilled = true; agg.fileLabel = v.fileLabel || ''; }
  }
  agg.unmatched = [...new Map(agg.unmatched.map((x) => [x.label, x])).values()];

  if (noProfile && !agg.filled.length) {
    status.textContent = '还没有个人档案 — 点击右上角「⚙️ 档案」先完善信息。';
    return;
  }
  status.textContent = `✅ 已填 ${agg.filled.length} 项`
    + (agg.expanded.length ? ` · 自动展开 ${agg.expanded.join(' ')}` : '')
    + (agg.fileFilled ? '(含简历附件)' : '')
    + (agg.skipped.length ? ` · 跳过 ${agg.skipped.length}` : '')
    + (agg.unmatched.length ? ` · 未识别 ${agg.unmatched.length}` : '');
  res.innerHTML = renderReport(agg);
}

/* 扫描字段清单:不写入任何值,导出本页所有可见字段及其命中的规则,便于排查漏填 */
async function doScan() {
  const status = $('#status'), res = $('#result');
  res.innerHTML = '';
  let tab;
  try { [tab] = await rqfApi.tabs.query({ active: true, currentWindow: true }); } catch { }
  if (!tab || !/^https?:/i.test(tab.url || '')) {
    status.textContent = '当前页面不支持注入(仅支持 http/https 页面)。';
    return;
  }
  if (!(await window.rqfEnsureHost())) {
    status.textContent = window.rqfNoHostMessage();
    return;
  }
  status.textContent = '正在扫描字段…';

  let results;
  try {
    await rqfApi.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['content.js'] });
    results = await rqfApi.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: async () => {
        const ext = (typeof browser !== 'undefined' && browser.storage) ? browser : chrome;
        try {
          const st = await ext.storage.local.get('profile');
          return window.__RQF ? window.__RQF.scan(st.profile || {}) : null;
        } catch { return null; }
      },
    });
  } catch (e) { status.textContent = '扫描失败:' + ((e && e.message) || e); return; }

  const rows = [];
  let ver = '';
  for (const r of results || []) if (r && r.result && r.result.rows) {
    rows.push(...r.result.rows);
    ver = r.result.version || ver;
  }
  if (!rows.length) { status.textContent = '没有扫描到任何表单字段。'; return; }

  const miss = rows.filter((r) => !r.rule && !r.filled);
  const lines = [
    `# 字段清单 — ${tab.title || ''}`,
    tab.url,
    `引擎版本 ${ver || '未知'}(与 README 不符说明扩展未刷新)`,
    `共 ${rows.length} 个字段,其中 ${miss.length} 个未命中规则`,
    '',
    '| 字段标签 | 控件 | 命中规则 | 已有值 |',
    '| --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.label} | ${r.ctrl} | ${r.rule || '—'} | ${r.filled ? '是' : ''} |`),
  ];
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    status.textContent = `✅ 已复制 ${rows.length} 个字段的清单到剪贴板(${miss.length} 个未命中规则)`;
  } catch {
    status.textContent = `扫描到 ${rows.length} 个字段,但复制失败,请看下方列表`;
  }
  res.innerHTML = `<details open><summary>未命中规则的字段(${miss.length})</summary>`
    + (miss.length
      ? miss.slice(0, 60).map((r) => `<div class="row"><span>${esc(r.label)}</span><em>${esc(r.ctrl)}</em></div>`).join('')
      : '<div class="hint">全部字段都已命中规则。</div>')
    + '</details>';
}

/* 档案自检:把浏览器本地存储里实际存的内容摊开,
 * 用来区分「插件没认出字段」和「档案里本来就没这项数据」—— 这两者的修法完全不同。 */
const CHECK_BASIC = [
  ['fullName', '姓名'], ['namePinyin', '姓名拼音'], ['phone', '手机'], ['email', '邮箱'],
  ['gender', '性别'], ['birthday', '出生日期'], ['idNumber', '证件号码'], ['politicalStatus', '政治面貌'],
  ['ethnicity', '民族'], ['hometown', '籍贯'], ['nationality', '国籍'], ['hobbies', '兴趣爱好'],
  ['city', '现居城市'], ['expectedCity', '期望城市'], ['expectedSalary', '期望薪资'],
  ['gradYear', '毕业年份'], ['yearsExp', '工作年限'], ['availableDate', '到岗时间'],
];
const CHECK_LISTS = [
  ['education', '教育经历', ['school', 'degree', 'major', 'college', 'startTime', 'endTime', 'rank', 'gpaScore', 'gpaTotal', 'lab', 'advisor', 'research']],
  ['work', '工作/实习', ['company', 'title', 'dept', 'startTime', 'endTime', 'skills', 'desc']],
  ['projects', '项目经历', ['name', 'role', 'startTime', 'endTime', 'desc']],
  ['papers', '论文', ['name', 'type', 'authorOrder', 'date', 'url', 'desc']],
  ['competitions', '竞赛', ['name', 'type', 'result', 'startTime', 'endTime', 'desc']],
  ['awards', '荣誉奖项', ['name', 'type', 'result', 'date', 'desc']],
  ['languages', '外语', ['name', 'cert', 'score']],
  ['progLangs', '编程语言', ['name', 'level']],
  ['patents', '专利', ['name', 'type', 'no', 'date', 'desc']],
  ['softwares', '软件著作权', ['name', 'type', 'date', 'desc']],
];
const CHECK_TEXT = [['intro', '自我介绍'], ['skills', '专业技能'], ['campusWork', '校园工作经历']];

async function doCheck() {
  const status = $('#status'), res = $('#result');
  res.innerHTML = '';
  let profile = null, resumeFile = null;
  try { ({ profile, resumeFile } = await rqfApi.storage.local.get(['profile', 'resumeFile'])); } catch { }
  if (!profile) { status.textContent = '插件里还没有任何档案 —— 请先到「⚙️ 档案」导入或填写。'; return; }

  const lines = ['# 档案自检'], html = [];
  const has = (v) => !!String(v ?? '').trim();

  const b = profile.basic || {};
  const bMiss = CHECK_BASIC.filter(([k]) => !has(b[k])).map(([, l]) => l);
  lines.push(`基本信息:已填 ${CHECK_BASIC.length - bMiss.length}/${CHECK_BASIC.length}` + (bMiss.length ? ` · 缺:${bMiss.join('、')}` : ''));
  html.push(`<div class="row"><span>基本信息</span><em>${CHECK_BASIC.length - bMiss.length}/${CHECK_BASIC.length} 项</em></div>`
    + (bMiss.length ? `<div class="hint">缺:${esc(bMiss.join('、'))}</div>` : ''));

  for (const [key, label, fields] of CHECK_LISTS) {
    const raw = profile[key];
    // 兼容旧版单段档案(对象而非数组)
    const list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' && Object.keys(raw).length ? [raw] : []);
    if (!list.length) {
      lines.push(`${label}:0 段`);
      html.push(`<div class="row"><span>${esc(label)}</span><em>0 段</em></div>`);
      continue;
    }
    const detail = list.map((e, i) => {
      const miss = fields.filter((f) => !has(e[f]));
      return `  第${i + 1}段 ${e.name || e.school || e.company || ''}:已填 ${fields.length - miss.length}/${fields.length}`
        + (miss.length ? ` · 缺 ${miss.join(',')}` : '');
    });
    lines.push(`${label}:${list.length} 段`, ...detail);
    html.push(`<div class="row ok"><span>${esc(label)}</span><em>${list.length} 段</em></div>`
      + detail.map((d) => `<div class="hint">${esc(d.trim())}</div>`).join(''));
  }

  for (const [k, l] of CHECK_TEXT) {
    const n = String(profile[k] ?? '').trim().length;
    lines.push(`${l}:${n ? n + ' 字' : '空'}`);
    html.push(`<div class="row"><span>${esc(l)}</span><em>${n ? n + ' 字' : '空'}</em></div>`);
  }
  const qa = (profile.custom || []).length;
  lines.push(`自定义问答:${qa} 条`);
  html.push(`<div class="row"><span>自定义问答</span><em>${qa} 条</em></div>`);
  const rf = resumeFile && resumeFile.name ? `${resumeFile.name}(${(resumeFile.size / 1024).toFixed(0)} KB)` : '未上传';
  lines.push(`简历附件:${rf}`);
  html.push(`<div class="row"><span>简历附件</span><em>${esc(rf)}</em></div>`);

  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    status.textContent = '✅ 自检结果已复制到剪贴板';
  } catch { status.textContent = '自检完成(复制失败,请看下方)'; }
  res.innerHTML = `<details open><summary>档案里实际存了什么</summary>${html.join('')}</details>`;
}

/* 弹窗里就地导出备份:不必先进档案页,降低「懒得备份」的摩擦 */
async function exportBackup() {
  try {
    const st = await rqfApi.storage.local.get(['profile', 'resumeFile']);
    if (!st.profile) return;
    const blob = new Blob([JSON.stringify({ profile: st.profile, resumeFile: st.resumeFile || null }, null, 2)],
      { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    await rqfApi.downloads.download({
      url, filename: `resume-quickfill-backup-${new Date().toISOString().slice(0, 10)}.json`, saveAs: true,
    });
    await rqfApi.storage.local.set({ lastBackupAt: Date.now() });
    $('#status').textContent = '✅ 备份已导出';
    if (window.rqfRenderBackup) await window.rqfRenderBackup($('#backup-bar'), exportBackup);
  } catch (e) {
    $('#status').textContent = '导出失败,请到「⚙️ 档案」页导出:' + ((e && e.message) || e);
  }
}

async function init() {
  let profile = null;
  try { ({ profile } = await rqfApi.storage.local.get('profile')); } catch { }
  renderChips(profile);
  if (!profile) $('#status').textContent = '尚未创建档案 — 请先点击右上角「⚙️ 档案」完善信息。';
  $('#btn-fill').addEventListener('click', doFill);
  $('#btn-scan').addEventListener('click', doScan);
  $('#btn-check').addEventListener('click', doCheck);
  $('#btn-opts').addEventListener('click', () => rqfApi.runtime.openOptionsPage());
  if (window.rqfRenderBackup) await window.rqfRenderBackup($('#backup-bar'), exportBackup);
}

init();
