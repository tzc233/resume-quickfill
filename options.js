/* 设置页:档案编辑(含多段经历)、简历附件存取、备份导入导出 */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const store = (typeof rqfApi !== 'undefined' && rqfApi && rqfApi.storage && rqfApi.storage.local)
  ? rqfApi.storage.local
  : { // 非扩展环境(本地预览)降级,只读不写
    async get() { return {}; },
    async set() { throw new Error('仅在扩展环境中可保存'); },
    async remove() { },
  };

const getPath = (o, p) => p.split('.').reduce((a, k) => (a ? a[k] : undefined), o);
const setPath = (o, p, v) => {
  const ks = p.split('.');
  let cur = o;
  for (let i = 0; i < ks.length - 1; i++) cur = cur[ks[i]] = cur[ks[i]] || {};
  cur[ks[ks.length - 1]] = v;
};
const delPath = (o, p) => {
  const ks = p.split('.');
  let cur = o;
  for (let i = 0; i < ks.length - 1; i++) { cur = cur[ks[i]]; if (!cur) return; }
  delete cur[ks[ks.length - 1]];
};

/* 上次从存储读到的完整档案。保存时以它为底,只覆盖页面确实渲染出来的部分 ——
 * 否则页面上没有输入框的字段(如早期版本缺失的「姓名拼音」)会在保存时被静默删掉。 */
let LOADED_PROFILE = {};

let toastTimer = null;
function toast(msg, isErr) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2200);
}

/* ============ 多段经历(教育 / 工作 / 项目)============ */
const LIST_SPEC = {
  education: {
    fields: [
      { k: 'school', l: '学校名称', ph: '某某大学' },
      { k: 'degree', l: '学历', type: 'select', opts: ['', '博士', '硕士', '学士', '大专'] },
      { k: 'major', l: '专业名称', ph: '计算机科学与技术' },
      { k: 'college', l: '学院 / 系' },
      { k: 'startTime', l: '入学时间', type: 'month' },
      { k: 'endTime', l: '毕业时间', type: 'month' },
      { k: 'city', l: '院校所在城市' },
      { k: 'isHighest', l: '是否最高学历', type: 'select', opts: ['', '是', '否'] },
      { k: 'eduType', l: '学历类型', ph: '统招' },
      { k: 'studyForm', l: '学习形式', ph: '全日制' },
      { k: 'rank', l: '成绩排名', ph: '2/30' },
      { k: 'gpaScore', l: 'GPA 分数', ph: '3.63' },
      { k: 'gpaTotal', l: 'GPA 总分', ph: '4.00' },
      { k: 'lab', l: '实验室名称' },
      { k: 'advisor', l: '导师姓名' },
      { k: 'research', l: '研究方向', full: true },
    ],
  },
  work: {
    fields: [
      { k: 'company', l: '公司名称', ph: '某某科技' },
      { k: 'title', l: '职位名称', ph: '算法工程师' },
      // 有的表单把「实习经历」和「工作经历」分成两个区块,靠这一栏决定投放到哪边;
      // 留空则按职位名称推断(含「实习」二字即算实习)
      { k: 'type', l: '性质', ph: '实习 / 全职' },
      { k: 'dept', l: '所在部门' },
      { k: 'startTime', l: '开始时间', type: 'month' },
      { k: 'endTime', l: '结束时间(在职填「至今」)', ph: '至今' },
      { k: 'skills', l: '使用技能' },
      { k: 'desc', l: '经历描述及成果', type: 'textarea', full: true },
    ],
  },
  projects: {
    fields: [
      { k: 'name', l: '项目名称' },
      { k: 'role', l: '项目职务 / 担任角色', ph: '负责人 / 核心开发' },
      { k: 'startTime', l: '开始时间', type: 'month' },
      { k: 'endTime', l: '结束时间', ph: '2025-12 / 至今' },
      { k: 'desc', l: '项目描述及成果', type: 'textarea', full: true },
      { k: 'duty', l: '项目职责(百度等表单单独设此栏)', type: 'textarea', full: true },
    ],
  },
  papers: {
    fields: [
      { k: 'name', l: '论文名称', full: true },
      { k: 'type', l: '论文类型', ph: 'Findings of ACL 2026(CCF A)' },
      { k: 'authorOrder', l: '作者顺序', ph: '第一作者' },
      { k: 'date', l: '发表时间', type: 'month' },
      { k: 'url', l: '论文链接' },
      { k: 'desc', l: '论文描述', type: 'textarea', full: true },
    ],
  },
  competitions: {
    fields: [
      { k: 'name', l: '竞赛名称' },
      { k: 'type', l: '竞赛类型 / 级别', ph: '国家级 / 国际级' },
      { k: 'result', l: '竞赛成绩', ph: '二等奖' },
      { k: 'awardDate', l: '获奖时间（用于获奖栏目）', type: 'month' },
      { k: 'startTime', l: '开始时间', type: 'month' },
      { k: 'endTime', l: '结束时间', type: 'month' },
      { k: 'desc', l: '竞赛描述', type: 'textarea', full: true },
    ],
  },
  awards: {
    fields: [
      { k: 'name', l: '奖项名称' },
      { k: 'type', l: '奖项类型 / 级别', ph: '校级奖学金' },
      { k: 'result', l: '奖项成绩', ph: '一等' },
      { k: 'date', l: '获奖时间', type: 'month' },
      { k: 'desc', l: '奖项描述', type: 'textarea', full: true },
    ],
  },
  languages: {
    fields: [
      { k: 'name', l: '语言种类', ph: '英语' },
      { k: 'cert', l: '认证类型', ph: 'CET-6' },
      { k: 'score', l: '成绩' },
    ],
  },
  progLangs: {
    fields: [
      { k: 'name', l: '编程语言名称', ph: 'Python' },
      { k: 'level', l: '掌握程度', ph: '熟练' },
    ],
  },
  patents: {
    fields: [
      { k: 'name', l: '专利名称', full: true },
      { k: 'type', l: '专利类型', ph: '发明专利' },
      { k: 'no', l: '专利编号' },
      { k: 'date', l: '发布时间', type: 'month' },
      { k: 'desc', l: '专利描述', type: 'textarea', full: true },
    ],
  },
  softwares: {
    fields: [
      { k: 'name', l: '软件名称', full: true },
      { k: 'type', l: '软件类型' },
      { k: 'date', l: '著作时间', type: 'month' },
      { k: 'desc', l: '软件概述', type: 'textarea', full: true },
    ],
  },
};

/* ============ 日期 ============
 * 档案里的日期统一是 YYYY-MM;在职/在读的结束时间写「至今」。
 * <input type="month"> 只认 YYYY-MM,别的写法(「2025」「2020.09」)会被浏览器
 * 静默清空 —— 页面上看着是空的,一点保存就把这条日期从档案里删掉了。
 * 所以值不合格时退回普通文本框,原样保留,交给体检提示用户改。
 * Firefox 不支持 month,本来就是文本框,同样靠体检兜住。 */
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_KEYS = new Set(['startTime', 'endTime', 'date', 'awardDate']);
const dateProblem = (k, v) => {
  if (!v || MONTH_RE.test(v)) return '';
  if (k === 'endTime' && v === '至今') return '';
  if (/^\d{4}$/.test(v)) return '只有年份,缺月份';
  return '格式应为 YYYY-MM' + (k === 'endTime' ? ' 或「至今」' : '');
};

/* 排名换算成百分位:优必选这类表单的排名是「前5% / 前10% / …」下拉,
 * 档案写的是「3/30」,两边对不上,插件按规则留空。先把换算结果摆在旁边。 */
const rankPercent = (v) => {
  const m = String(v || '').match(/(\d+)\s*\/\s*(\d+)/);
  if (!m || !+m[2] || +m[1] > +m[2]) return '';
  return `≈ 前 ${(100 * m[1] / m[2]).toFixed(1).replace(/\.0$/, '')}%`;
};

// 段头显示这一段是什么,挪顺序时才认得出谁是谁
const TITLE_KEY = { education: 'school', work: 'company', projects: 'name', papers: 'name',
  competitions: 'name', awards: 'name', languages: 'name', progLangs: 'name', patents: 'name', softwares: 'name' };

function entryRow(listKey, data = {}, idx = 0) {
  const spec = LIST_SPEC[listKey];
  const box = document.createElement('div');
  box.className = 'entry';
  box.innerHTML = `<div class="entry-head"><span class="entry-no">第 ${idx + 1} 段</span>
    <span class="entry-title"></span>
    <span class="entry-ops">
      <button class="ghost entry-up" title="上移">↑</button>
      <button class="ghost entry-down" title="下移">↓</button>
      <button class="ghost danger entry-del" title="删除这一段">✕ 删除</button>
    </span></div>
    <div class="grid entry-grid"></div>`;
  const grid = box.querySelector('.entry-grid');

  for (const f of spec.fields) {
    const lab = document.createElement('label');
    if (f.full) lab.className = 'span-all';
    lab.append(f.l);
    const val = String(data[f.k] ?? '');
    let ctrl;
    if (f.type === 'select') {
      ctrl = document.createElement('select');
      const opts = f.opts.includes(val) ? f.opts : [...f.opts, val];   // 档案里的值不在选项里也不能丢
      for (const o of opts) ctrl.append(new Option(o, o));
    } else if (f.type === 'textarea') {
      ctrl = document.createElement('textarea');
      ctrl.rows = 3;
    } else {
      ctrl = document.createElement('input');
      if (f.type === 'month' && !dateProblem(f.k, val)) ctrl.type = 'month';
      else if (f.type && f.type !== 'month') ctrl.type = f.type;
      if (f.type === 'month' && !f.ph) ctrl.placeholder = 'YYYY-MM';
    }
    if (f.ph) ctrl.placeholder = f.ph;
    ctrl.dataset.k = f.k;
    ctrl.value = val;
    lab.append(ctrl);
    if (listKey === 'education' && f.k === 'rank') {
      const hint = document.createElement('span');
      hint.className = 'rank-hint';
      const upd = () => { hint.textContent = rankPercent(ctrl.value); };
      ctrl.addEventListener('input', upd); upd();
      lab.append(hint);
    }
    grid.append(lab);
  }

  const titleEl = box.querySelector('.entry-title');
  const titleCtrl = box.querySelector(`[data-k="${TITLE_KEY[listKey]}"]`);
  const updTitle = () => { titleEl.textContent = titleCtrl ? titleCtrl.value.trim() : ''; };
  if (titleCtrl) titleCtrl.addEventListener('input', updTitle);
  updTitle();

  const move = (dir) => {
    const sib = dir < 0 ? box.previousElementSibling : box.nextElementSibling;
    if (!sib) return;
    if (dir < 0) sib.before(box); else sib.after(box);
    renumber(listKey); markDirty();
  };
  box.querySelector('.entry-up').addEventListener('click', () => move(-1));
  box.querySelector('.entry-down').addEventListener('click', () => move(1));
  box.querySelector('.entry-del').addEventListener('click', () => {
    // 有内容的段先确认 —— 一点就没、又顺手保存了,就真没了
    const filled = [...box.querySelectorAll('[data-k]')].some((c) => c.value.trim());
    const name = titleEl.textContent ? `「${titleEl.textContent}」` : '';
    if (filled && !confirm(`删除${box.querySelector('.entry-no').textContent}${name}?保存后不可恢复。`)) return;
    box.remove();
    renumber(listKey); markDirty();
  });
  return box;
}

function renumber(listKey) {
  const wrap = document.querySelector(`[data-list="${listKey}"] .list`);
  [...wrap.children].forEach((c, i) => {
    c.querySelector('.entry-no').textContent = `第 ${i + 1} 段`;
    c.querySelector('.entry-up').disabled = i === 0;
    c.querySelector('.entry-down').disabled = i === wrap.children.length - 1;
  });
}

function renderList(listKey, items) {
  const wrap = document.querySelector(`[data-list="${listKey}"] .list`);
  wrap.innerHTML = '';
  (items || []).forEach((it, i) => wrap.append(entryRow(listKey, it, i)));
  renumber(listKey);
}

function collectList(listKey) {
  const wrap = document.querySelector(`[data-list="${listKey}"] .list`);
  return [...wrap.children].map((box) => {
    const o = {};
    for (const c of box.querySelectorAll('[data-k]')) {
      const v = c.value.trim();
      if (v) o[c.dataset.k] = v;
    }
    return o;
  }).filter((o) => Object.keys(o).length);
}

for (const sec of $$('[data-list]')) {
  sec.querySelector('.add-btn').addEventListener('click', () => {
    const key = sec.dataset.list;
    const wrap = sec.querySelector('.list');
    const row = entryRow(key, {}, wrap.children.length);
    wrap.append(row);
    renumber(key); markDirty();
    const first = row.querySelector('[data-k]');
    if (first) first.focus();
  });
}

/* ============ 自定义问答 ============ */
function qaRow(q = '', a = '') {
  const div = document.createElement('div');
  div.className = 'qa-row';
  div.innerHTML = `
    <input class="qa-q" placeholder="触发关键词(逗号分隔),如:为什么, why join">
    <textarea class="qa-a" rows="2" placeholder="要填入的内容"></textarea>
    <button class="ghost danger qa-del" title="删除">✕</button>`;
  div.querySelector('.qa-q').value = q;
  div.querySelector('.qa-a').value = a;
  div.querySelector('.qa-del').addEventListener('click', () => { div.remove(); markDirty(); });
  return div;
}
function renderCustom(list) {
  const wrap = $('#qa-list');
  wrap.innerHTML = '';
  for (const it of list) wrap.appendChild(qaRow(it.q, it.a));
}

/* ============ 简历附件 ============ */
function renderResume(rf) {
  const info = $('#resume-info');
  const del = $('#resume-del');
  RESUME_SAVED = !!(rf && rf.name);
  scheduleRefresh();
  if (rf && rf.name) {
    info.textContent = `📎 已保存:${rf.name}(${(rf.size / 1024).toFixed(0)} KB)`;
    del.hidden = false;
  } else {
    info.textContent = '未上传。上传后,遇到「上传简历 / Resume / CV / 附件」类控件会自动注入该文件。';
    del.hidden = true;
  }
}

/* ============ 未保存改动 ============
 * 档案页没有自动保存:改完直接关标签页,改动就没了,而且不会有任何提示。 */
let DIRTY = false;
function markDirty() {
  DIRTY = true;
  $('#dirty').hidden = false;
  scheduleRefresh();
}
function markClean() {
  DIRTY = false;
  $('#dirty').hidden = true;
}
window.addEventListener('beforeunload', (e) => {
  if (!DIRTY) return;
  e.preventDefault();
  e.returnValue = '';
});

/* ============ 档案体检 ============
 * 把「填表时会被跳过」的原因提前摆出来:缺月份的日期、顺序不对的经历、
 * 没上传的简历……这些在诊断报告里反复出现,但只有到了招聘页才看得见。 */
const LIST_TITLE = {};
for (const sec of $$('[data-list]')) LIST_TITLE[sec.dataset.list] = sec.querySelector('h2').textContent.trim();
// 判断先后顺序用的日期:有开始时间看开始,一条只配一个日期的看那个日期
const sortDate = (e) => [e.startTime, e.date, e.awardDate, e.endTime].find((v) => MONTH_RE.test(v || '')) || '';
let RESUME_SAVED = false;

function healthIssues() {
  const out = [];
  const add = (text, el) => out.push({ text, el });
  if (!RESUME_SAVED) add('还没上传简历附件 —— 遇到「上传简历」控件时会被跳过', $('#resume-file').closest('.card'));
  const bday = document.querySelector('[data-path="basic.birthday"]');
  if (bday && bday.value.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(bday.value.trim())) {
    add(`基本信息 · 出生日期「${bday.value.trim()}」格式应为 YYYY-MM-DD`, bday);
  }
  for (const [path, name] of [['basic.fullName', '姓名'], ['basic.phone', '手机号'], ['basic.email', '邮箱']]) {
    const el = document.querySelector(`[data-path="${path}"]`);
    if (el && !el.value.trim()) add(`基本信息 · ${name}为空`, el);
  }
  for (const key of Object.keys(LIST_SPEC)) {
    const boxes = [...document.querySelectorAll(`[data-list="${key}"] .list > .entry`)];
    const label = (f) => (LIST_SPEC[key].fields.find((x) => x.k === f) || {}).l || f;
    const rows = boxes.map((box) => {
      const o = {};
      for (const c of box.querySelectorAll('[data-k]')) o[c.dataset.k] = c.value.trim();
      return o;
    });
    rows.forEach((o, i) => {
      for (const k of Object.keys(o)) {
        if (!DATE_KEYS.has(k)) continue;
        const why = dateProblem(k, o[k]);
        if (why) add(`${LIST_TITLE[key]} · 第 ${i + 1} 段 · ${label(k).replace(/\s*[(（].*$/, '')}「${o[k]}」${why}`,
          boxes[i].querySelector(`[data-k="${k}"]`));
      }
      if (MONTH_RE.test(o.startTime || '') && MONTH_RE.test(o.endTime || '') && o.endTime < o.startTime) {
        add(`${LIST_TITLE[key]} · 第 ${i + 1} 段 · 结束时间早于开始时间`, boxes[i].querySelector('[data-k="endTime"]'));
      }
    });
    // 插件按顺序逐段填,第一段必须是最新的;只报第一处,改完再看下一处
    for (let i = 0; i + 1 < rows.length; i++) {
      const a = sortDate(rows[i]), b = sortDate(rows[i + 1]);
      if (a && b && a < b) {
        add(`${LIST_TITLE[key]} · 第 ${i + 1}、${i + 2} 段不是时间倒序 —— 插件按顺序逐段填,第一段应是最新的(用 ↑↓ 调整)`,
          boxes[i + 1].querySelector('.entry-up'));
        break;
      }
    }
  }
  return out;
}

function renderHealth() {
  const list = $('#health-list');
  const issues = healthIssues();
  list.innerHTML = '';
  $('#health-count').textContent = issues.length ? `${issues.length} 项待处理` : '';
  if (!issues.length) {
    const li = document.createElement('li');
    li.className = 'ok';
    li.textContent = '✅ 没发现会导致漏填的问题';
    list.append(li);
    return;
  }
  for (const it of issues) {
    const li = document.createElement('li');
    li.textContent = it.text;
    li.tabIndex = 0;
    const go = () => {
      if (!it.el) return;
      it.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (it.el.matches('input,select,textarea,button')) it.el.focus({ preventScroll: true });
      it.el.classList.remove('flash'); void it.el.offsetWidth; it.el.classList.add('flash');
    };
    li.addEventListener('click', go);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    list.append(li);
  }
}

/* ============ 目录 ============
 * 十几个区块一屏放不下,目录顺带显示每个列表有几段 —— 导入新档案后一眼看出变化。 */
function renderToc() {
  const toc = $('#toc');
  toc.innerHTML = '';
  $$('section.card').forEach((sec, i) => {
    if (sec.id === 'health') return;
    if (!sec.id) sec.id = 'sec-' + i;
    const a = document.createElement('a');
    a.href = '#' + sec.id;
    a.textContent = sec.querySelector('h2').textContent.trim();
    if (sec.dataset.list) {
      const n = sec.querySelectorAll('.list > .entry').length;
      const b = document.createElement('b');
      b.textContent = n;
      if (!n) b.className = 'zero';
      a.append(' ', b);
    }
    toc.append(a);
  });
}

let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { renderHealth(); renderToc(); }, 150);
}

/* ============ 读取与保存 ============ */
function collectProfile() {
  // 以存储里的完整档案为底,只覆盖页面负责渲染的部分,页面不认识的字段原样保留
  const p = JSON.parse(JSON.stringify(LOADED_PROFILE || {}));
  for (const el of $$('[data-path]')) {
    const v = el.value.trim();
    // 清空输入框要能真的清掉,所以空值走删除而不是跳过
    if (v) setPath(p, el.dataset.path, v);
    else delPath(p, el.dataset.path);
  }
  for (const key of Object.keys(LIST_SPEC)) p[key] = collectList(key);
  p.custom = $$('.qa-row')
    .map((r) => ({ q: r.querySelector('.qa-q').value.trim(), a: r.querySelector('.qa-a').value.trim() }))
    .filter((x) => x.q && x.a);
  return p;
}

/* 旧版单段档案 → 数组,保证历史备份可用 */
const asList = (v) => (Array.isArray(v) ? v : (v && typeof v === 'object' && Object.keys(v).length ? [v] : []));

function fillForm(profile) {
  LOADED_PROFILE = profile || {};
  for (const el of $$('[data-path]')) {
    const v = String(getPath(profile, el.dataset.path) ?? '');
    // 同月份框:date 只认 YYYY-MM-DD,「2000.01.01」会被清空、保存即丢,退回文本框原样保留
    if (el.dataset.origType === 'date' || el.type === 'date') {
      el.dataset.origType = 'date';
      el.type = !v || /^\d{4}-\d{2}-\d{2}$/.test(v) ? 'date' : 'text';
    }
    el.value = v;
  }
  renderList('education', asList(profile.education).map((e) => ({ ...e, endTime: e.endTime || e.eduTime || '' })));
  renderList('work', asList(profile.work).map((w) => ({ ...w, desc: w.desc || w.workDesc || '' })));
  for (const k of ['projects', 'papers', 'competitions', 'awards', 'languages', 'progLangs', 'patents', 'softwares']) {
    renderList(k, asList(profile[k]));
  }
  renderCustom(profile.custom || []);
}

/* 备份提示条:档案改过没备份 / 超过 30 天没备份时出现 */
async function renderBackupBanner() {
  if (window.rqfRenderBackup) {
    await window.rqfRenderBackup($('#backup-bar'), () => $('#btn-export').click());
  }
}

async function load() {
  let profile = {}, resumeFile = null;
  try {
    const st = await store.get(['profile', 'resumeFile']);
    profile = st.profile || {};
    resumeFile = st.resumeFile || null;
  } catch { }
  fillForm(profile);
  renderResume(resumeFile);
  markClean();
  renderHealth();
  renderToc();
  renderBackupBanner();
}

async function save() {
  try {
    // 记录改动时间:用来判断「档案改过但还没备份」—— 比单纯的天数更有意义
    await store.set({ profile: collectProfile(), profileUpdatedAt: Date.now() });
    toast('✅ 已保存');
    markClean();
    renderBackupBanner();
  } catch (e) { toast('保存失败:' + e.message, true); }
}

/* ============ 事件 ============ */
$('#btn-save').addEventListener('click', save);
$('#qa-add').addEventListener('click', () => { $('#qa-list').appendChild(qaRow()); markDirty(); });
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    save();
  }
});
// 文件框不算档案改动:简历附件选中即存,导入另有确认
const main = $('main');
for (const type of ['input', 'change']) {
  main.addEventListener(type, (e) => { if (e.target.type !== 'file') markDirty(); });
}

$('#resume-file').addEventListener('change', (ev) => {
  const f = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  if (f.size > 8 * 1024 * 1024) { toast('文件超过 8MB,请压缩后再上传', true); return; }
  const rd = new FileReader();
  rd.onload = async () => {
    const dataBase64 = String(rd.result).split(',')[1] || '';
    try {
      await store.set({ resumeFile: { name: f.name, type: f.type || 'application/pdf', size: f.size, dataBase64 } });
      renderResume({ name: f.name, size: f.size });
      toast('✅ 简历已保存到插件本地');
    } catch (e) { toast('保存失败:' + e.message, true); }
  };
  rd.readAsDataURL(f);
});

$('#resume-del').addEventListener('click', async () => {
  try { await store.remove('resumeFile'); renderResume(null); toast('已删除简历附件'); }
  catch (e) { toast('删除失败:' + e.message, true); }
});

$('#btn-export').addEventListener('click', async () => {
  let resumeFile = null;
  try { ({ resumeFile } = await store.get('resumeFile')); } catch { }
  const blob = new Blob([JSON.stringify({ profile: collectProfile(), resumeFile }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `resume-quickfill-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  try { await store.set({ lastBackupAt: Date.now() }); renderBackupBanner(); } catch { }
});

/* 导入是整份覆盖。原来选中文件就直接写入,拿错一份老备份,
 * 当前档案就悄无声息地退回去了 —— 先把每个列表的段数变化摆出来确认。 */
function importSummary(data, fileName) {
  const cur = collectProfile(), inc = data.profile;
  const lines = [];
  for (const key of Object.keys(LIST_SPEC)) {
    const a = asList(cur[key]).length, b = asList(inc[key]).length;
    if (a || b) lines.push(`${LIST_TITLE[key]}  ${a} → ${b} 段${a === b ? '' : '  ◀'}`);
  }
  const basicDiff = Object.keys({ ...(cur.basic || {}), ...(inc.basic || {}) })
    .filter((k) => String((cur.basic || {})[k] || '') !== String((inc.basic || {})[k] || '')).length;
  lines.push(`基本信息  ${basicDiff ? basicDiff + ' 项不同' : '相同'}`);
  lines.push(data.resumeFile ? '简历附件  将替换为备份里的文件' : '简历附件  备份里没有,保留当前的');
  return `用「${fileName}」覆盖当前档案:\n\n${lines.join('\n')}\n\n`
    + (DIRTY ? '⚠️ 页面上还有未保存的改动,导入后会丢失。\n' : '') + '继续吗?';
}

$('#btn-import').addEventListener('change', (ev) => {
  const f = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  const rd = new FileReader();
  rd.onload = async () => {
    try {
      const data = JSON.parse(String(rd.result));
      if (!data || typeof data !== 'object' || !data.profile) throw new Error('格式不正确');
      if (!confirm(importSummary(data, f.name))) { toast('已取消导入'); return; }
      await store.set({ profile: data.profile });
      if (data.resumeFile) await store.set({ resumeFile: data.resumeFile });
      await load();
      toast('✅ 导入成功');
    } catch (e) { toast('导入失败:' + e.message, true); }
  };
  rd.readAsText(f);
});

load();
