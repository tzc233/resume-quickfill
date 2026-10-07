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
  // 原对象:保存时带回页面不渲染的键(版本覆盖 _v、旧版遗留字段),否则一保存就被吞掉
  box._orig = data;
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
  const shown = new Set(LIST_SPEC[listKey].fields.map((f) => f.k));
  return [...wrap.children].map((box) => {
    const o = {};
    for (const [k, v] of Object.entries(box._orig || {})) if (!shown.has(k)) o[k] = JSON.parse(JSON.stringify(v));
    for (const c of box.querySelectorAll('[data-k]')) {
      const v = c.value.trim();
      if (v) o[c.dataset.k] = v;
    }
    return o;
  }).filter((o) => Object.keys(o).some((k) => k !== '_v'));
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
/* 每份简历有自己的附件 PDF(默认简历在 resumeFile,其余在 resumeFiles[id]),互不顶替 */
const RESUME = { base: null, files: {} };
const kb = (f) => `${(f.size / 1024).toFixed(0)} KB`;
function renderResume() {
  const info = $('#resume-info');
  const del = $('#resume-del');
  const own = CUR === 'default' ? RESUME.base : RESUME.files[CUR];
  RESUME_SAVED = !!(own && own.name);
  scheduleRefresh();
  del.hidden = !(own && own.name);
  if (own && own.name) {
    info.textContent = `📎「${verName(CUR)}」的附件:${own.name}(${kb(own)})`;
  } else if (Object.keys(DOCS).length > 1) {
    // 不拿别的简历的 PDF 顶替:投央国企时注入私企版附件,比不注入更糟
    info.textContent = `「${verName(CUR)}」还没有上传附件 —— 用这份简历填表时不会注入附件。`;
  } else {
    info.textContent = '未上传。上传后,遇到「上传简历 / Resume / CV / 附件」类控件会自动注入该文件。';
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
  // 多份简历之间的事实矛盾:只提醒,不拦 —— 改不改由你定
  if (Object.keys(DOCS).length > 1) {
    const cur = collectProfile();
    for (const [id, doc] of Object.entries(DOCS)) {
      if (id === CUR) continue;
      for (const d of VR.factDiffs(cur, doc)) {
        let where, el;
        if (!d.list) {
          el = document.querySelector(`[data-path="${d.field}"]`);
          where = `基本信息 · ${(el && el.closest('label')?.firstChild?.textContent || d.field).trim()}`;
        } else {
          const box = document.querySelectorAll(`[data-list="${d.list}"] .list > .entry`)[d.index];
          el = box && box.querySelector(`[data-k="${d.field}"]`);
          const f = (LIST_SPEC[d.list].fields.find((x) => x.k === d.field) || {}).l || d.field;
          where = `${LIST_TITLE[d.list]}「${d.name}」· ${f}`;
        }
        add(`与「${verName(id)}」不一致 · ${where}:这里写「${d.a}」,那份写「${d.b}」`, el);
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
    if (sec.id === 'health' || !sec.querySelector('h2')) return;
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

/* ============ 填写记忆 ============
 * 记忆原来是个只进不出的黑箱:看不到记了什么,只能在弹窗里逐站清空;
 * 2.20.0 之前还会把无关网站输入框里打的字一并记下。这里按站点摊开,
 * 并给两条出路:对单站有用的留着,对所有站都成立的写进档案 / 自定义问答。
 * 删除直接写存储(先读最新再删,不覆盖其它标签页刚记下的);写进档案只改表单,走正常保存。 */
const MEM_STORE = 'rqfV2LearnedSelections', MEM_SITES = 'rqfV2LearnSites';
let MEM = {}, MEM_ON = {};
const memKey = (key) => {
  const m = key.match(/^site:([^|]+)\|(field|text|label|input):(.*)$/);
  return m ? { host: m[1], kind: m[2], rest: m[3] } : null;
};
// 记忆里的路径与档案同名(basic.wechat / education.0.degree),找到档案页上对应的那一栏
const memTarget = (path) => {
  const el = document.querySelector(`[data-path="${path}"]`);
  if (el) return el;
  const m = path.match(/^(\w+)\.(\d+)\.(\w+)$/);
  if (!m || !LIST_SPEC[m[1]]) return null;
  const box = document.querySelectorAll(`[data-list="${m[1]}"] .list > .entry`)[+m[2]];
  return box ? box.querySelector(`[data-k="${m[3]}"]`) : null;
};
const memPathLabel = (path) => {
  const el = document.querySelector(`[data-path="${path}"]`);
  if (el) return (el.closest('label')?.firstChild?.textContent || path).trim();
  const m = path.match(/^(\w+)\.(\d+)\.(\w+)$/);
  if (m && LIST_SPEC[m[1]]) {
    const f = LIST_SPEC[m[1]].fields.find((x) => x.k === m[3]);
    return `${LIST_TITLE[m[1]]} 第 ${+m[2] + 1} 段 · ${f ? f.l : m[3]}`;
  }
  return path;
};
const memLabel = (k, row) => (k.kind === 'field' || k.kind === 'text')
  ? memPathLabel(k.rest) : (row.label || k.rest.replace(/#\d+$/, ''));
// 能写进档案吗:那一栏存在、目前为空、值放得进去(下拉要有这个选项,月份框要是 YYYY-MM)
const memPromotable = (k, row) => {
  if (k.kind !== 'field' && k.kind !== 'text') return { ok: false };
  const el = memTarget(k.rest);
  if (!el) return { ok: false, why: '档案里没有这一栏' };
  if (el.value.trim()) return { ok: false, why: '档案已有值,不覆盖' };
  if (el.tagName === 'SELECT') {
    const opt = [...el.options].find((o) => o.value === row.text || o.text === row.text);
    return opt ? { ok: true, el, value: opt.value } : { ok: false, why: '档案的下拉里没有这个选项' };
  }
  if (el.type === 'month' && !MONTH_RE.test(row.text)) return { ok: false, why: '不是 YYYY-MM 格式' };
  return { ok: true, el, value: row.text };
};
// 疑似无关:没点过填充、且只有零散输入框记录(没有一条对上简历字段)
const memJunk = (host, keys) => !MEM_ON[host] && keys.every((key) => memKey(key).kind === 'input');
const fmtDay = (t) => (t ? new Date(t).toISOString().slice(0, 10) : '');

async function memMutate(fn) {
  const st = await store.get([MEM_STORE, MEM_SITES]);
  const data = st[MEM_STORE] || {}, sites = st[MEM_SITES] || {};
  fn(data, sites);
  await store.set({ [MEM_STORE]: data, [MEM_SITES]: sites });
  MEM = data; MEM_ON = sites;
  renderMemory();
}

function renderMemory() {
  const host = $('#memory');
  const bySite = {};
  for (const key of Object.keys(MEM)) {
    const k = memKey(key);
    if (k) (bySite[k.host] ||= []).push(key);
  }
  const hosts = Object.keys(bySite);
  const latest = (h) => Math.max(...bySite[h].map((key) => MEM[key].updatedAt || 0));
  hosts.sort((a, b) => (!!MEM_ON[b] - !!MEM_ON[a]) || latest(b) - latest(a));
  const total = hosts.reduce((n, h) => n + bySite[h].length, 0);
  const texts = Object.keys(MEM).filter((key) => /\|(text|input):/.test(key)).length;
  $('#memory-summary').textContent = total
    ? `共 ${hosts.length} 个网站、${total} 条(填空 ${texts} / 下拉 ${total - texts})`
    : '还没有记忆。在点过「一键填充」的网站上手动补填后,会出现在这里。';
  const junk = hosts.filter((h) => memJunk(h, bySite[h]));
  const clean = $('#mem-clean');
  clean.hidden = !junk.length;
  clean.textContent = `清理 ${junk.length} 个疑似无关站点`;
  clean.onclick = () => {
    const list = junk.slice(0, 12).join('\n') + (junk.length > 12 ? `\n…等 ${junk.length} 个` : '');
    if (!confirm(`这些网站没点过「一键填充」,记下的只是零散输入框里的内容:\n\n${list}\n\n删除它们的全部记忆?`)) return;
    memMutate((data) => { for (const h of junk) for (const key of bySite[h]) delete data[key]; })
      .then(() => toast('已清理'), (e) => toast('清理失败:' + e.message, true));
  };

  host.innerHTML = '';
  for (const h of hosts) {
    const keys = bySite[h];
    const isJunk = memJunk(h, keys);
    const det = document.createElement('details');
    det.className = 'mem-site';
    det.dataset.host = h;
    det.open = !!MEM_ON[h] && keys.length <= 30;
    const sum = document.createElement('summary');
    sum.innerHTML = '<b></b><span class="mem-meta"></span>';
    sum.querySelector('b').textContent = h;
    sum.querySelector('.mem-meta').textContent = ` · ${keys.length} 条 · 最近 ${fmtDay(latest(h))}`;
    if (MEM_ON[h]) sum.insertAdjacentHTML('beforeend', '<span class="badge badge-on">已启用</span>');
    if (isJunk) sum.insertAdjacentHTML('beforeend', '<span class="badge badge-junk">疑似无关</span>');
    det.append(sum);

    const ops = document.createElement('div');
    ops.className = 'mem-ops';
    if (MEM_ON[h]) {
      const off = document.createElement('button');
      off.className = 'ghost mem-site-off';
      off.textContent = '停用该站记忆';
      off.title = '以后在这个网站手动填写不再记录;已有记忆保留,点「一键填充」会重新启用';
      off.onclick = () => memMutate((data, sites) => { delete sites[h]; })
        .then(() => toast(`已停用 ${h} 的记忆`), (e) => toast('操作失败:' + e.message, true));
      ops.append(off);
    }
    const del = document.createElement('button');
    del.className = 'ghost danger mem-site-del';
    del.textContent = '清除该站全部记忆';
    del.onclick = () => {
      if (!confirm(`删除 ${h} 的 ${keys.length} 条记忆?`)) return;
      memMutate((data) => { for (const key of keys) delete data[key]; })
        .then(() => toast('已清除'), (e) => toast('清除失败:' + e.message, true));
    };
    ops.append(del);
    det.append(ops);

    for (const key of keys.sort((a, b) => (MEM[b].updatedAt || 0) - (MEM[a].updatedAt || 0))) {
      const k = memKey(key), row = MEM[key];
      const r = document.createElement('div');
      r.className = 'mem-row';
      r.dataset.key = key;
      r.innerHTML = '<span class="mem-type"></span><span class="mem-label"></span><span class="mem-val"></span><span class="mem-acts"></span>';
      r.querySelector('.mem-type').textContent = (k.kind === 'text' || k.kind === 'input') ? '填空' : '下拉';
      r.querySelector('.mem-label').textContent = memLabel(k, row);
      const val = r.querySelector('.mem-val');
      val.textContent = row.text;
      val.title = `${row.text}\n记于 ${fmtDay(row.updatedAt)}`;
      const acts = r.querySelector('.mem-acts');
      if (k.kind === 'field' || k.kind === 'text') {
        const b = document.createElement('button');
        b.className = 'ghost mem-promote';
        b.textContent = '写进档案';
        const p = memPromotable(k, row);
        b.disabled = !p.ok;
        if (p.why) b.title = p.why;
        b.onclick = () => {
          const q = memPromotable(k, row);
          if (!q.ok) return;
          q.el.value = q.value;
          q.el.dispatchEvent(new Event('input', { bubbles: true }));
          b.disabled = true; b.textContent = '✓ 已写入';
          toast('已写进档案,保存后对所有网站生效');
        };
        acts.append(b);
      } else if (k.kind === 'input') {
        const q = memLabel(k, row);
        const b = document.createElement('button');
        b.className = 'ghost mem-qa';
        b.textContent = '转为自定义问答';
        const exists = $$('.qa-row').some((x) => x.querySelector('.qa-q').value.trim() === q);
        b.disabled = exists;
        if (exists) b.title = '自定义问答里已有这个关键词';
        b.onclick = () => {
          $('#qa-list').appendChild(qaRow(q, row.text));
          markDirty();
          b.disabled = true; b.textContent = '✓ 已加入';
          toast('已加到自定义问答,保存后对所有网站生效');
        };
        acts.append(b);
      }
      const d = document.createElement('button');
      d.className = 'ghost danger mem-del';
      d.textContent = '✕';
      d.title = '删除这条记忆';
      d.onclick = () => memMutate((data) => { delete data[key]; })
        .catch((e) => toast('删除失败:' + e.message, true));
      acts.append(d);
      det.append(r);
    }
    host.append(det);
  }
}

/* ============ 多份简历 ============
 * 见 versions.js:每份简历是一整份独立档案(例如「私企」「央国企」),附件也各是各的。
 * 页面上同时只编辑一份;其余几份放在 DOCS 里,切换时先把当前页面收进内存,
 * 保存时一起写回 —— 切来切去不丢没保存的改动。 */
const VR = window.rqfVersions;
let CUR = 'default';
let DOCS = { default: {} };
let NAMES = { default: '默认简历' };
const verName = (id) => NAMES[id] || '默认简历';

function renderVersionBar() {
  const tabs = $('#ver-tabs');
  tabs.innerHTML = '';
  const ids = Object.keys(DOCS);
  for (const id of ids) {
    const b = document.createElement('button');
    b.className = 'ver-tab' + (id === CUR ? ' active' : '');
    b.dataset.ver = id;
    b.textContent = verName(id);
    b.addEventListener('click', () => { if (id !== CUR) switchVersion(id); });
    tabs.append(b);
  }
  $('#ver-del').hidden = CUR === 'default';
  $('#ver-hint').textContent = ids.length < 2
    ? '投不同类型的公司要用不同的简历(如私企 / 央国企)时,点「+ 新建简历」:以当前这份为起点复制一份,之后各改各的,附件 PDF 也分开传。填表时在弹窗里选用哪份。'
    : `正在编辑「${verName(CUR)}」。每份简历独立保存,附件也各是各的;填表时在弹窗里选用哪份(按网站记住)。`;
}

function switchVersion(id) {
  DOCS[CUR] = collectProfile();   // 先把当前页面上的改动收进内存,切换不丢
  CUR = id;
  fillForm(DOCS[id]);
  renderVersionBar();
  renderResume();
  renderHealth(); renderToc(); renderMemory();
}

$('#ver-add').addEventListener('click', () => {
  const name = (prompt('新简历的名字(如:央国企、私企)', '') || '').trim();
  if (!name) return;
  DOCS[CUR] = collectProfile();
  const from = verName(CUR);
  const id = 'r' + Date.now().toString(36);
  const copy = JSON.parse(JSON.stringify(DOCS[CUR]));
  delete copy._name;
  DOCS[id] = copy;
  NAMES[id] = name;
  markDirty();
  switchVersion(id);
  toast(`已复制「${from}」的内容作为起点,改完记得保存`);
});
$('#ver-rename').addEventListener('click', () => {
  const name = (prompt('简历名字', verName(CUR)) || '').trim();
  if (!name) return;
  NAMES[CUR] = name;
  markDirty();
  renderVersionBar();
});
$('#ver-del').addEventListener('click', async () => {
  const id = CUR, name = verName(id);
  if (id === 'default') return;
  if (!confirm(`删除「${name}」这份简历?\n它的全部内容和附件都会删除(保存后生效)。`)) return;
  delete DOCS[id]; delete NAMES[id];
  if (RESUME.files[id]) {
    delete RESUME.files[id];
    try { await store.set({ resumeFiles: RESUME.files }); } catch (e) { toast('附件删除失败:' + e.message, true); }
  }
  CUR = 'default';
  fillForm(DOCS.default);
  renderVersionBar(); renderResume();
  markDirty();
  renderHealth(); renderToc(); renderMemory();
  toast(`已删除「${name}」,保存后生效`);
});

/* 存储结构:默认简历仍在 profile(老版本、弹窗、备份都认它),其余在 altProfiles */
function bundle() {
  DOCS[CUR] = collectProfile();
  const profile = JSON.parse(JSON.stringify(DOCS.default));
  if (NAMES.default && NAMES.default !== '默认简历') profile._name = NAMES.default; else delete profile._name;
  const altProfiles = {};
  for (const id of Object.keys(DOCS)) if (id !== 'default') altProfiles[id] = { name: verName(id), profile: DOCS[id] };
  return { profile, altProfiles };
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
  let profile = {}, migrated = false;
  try {
    const st = await store.get(['profile', 'altProfiles', 'resumeFile', 'resumeFiles', MEM_STORE, MEM_SITES]);
    // 2.22.0 的「版本覆盖」结构:转成独立简历,提示保存
    const m = VR.migrate(st);
    if (m.changed) { st.profile = m.profile; st.altProfiles = m.altProfiles; migrated = true; }
    profile = st.profile || {};
    DOCS = { default: profile };
    NAMES = { default: profile._name || '默认简历' };
    for (const [id, x] of Object.entries(st.altProfiles || {})) {
      DOCS[id] = (x && x.profile) || {};
      NAMES[id] = (x && x.name) || '未命名简历';
    }
    RESUME.base = st.resumeFile || null;
    RESUME.files = st.resumeFiles || {};
    MEM = st[MEM_STORE] || {};
    MEM_ON = st[MEM_SITES] || {};
  } catch { }
  CUR = 'default';
  fillForm(DOCS.default || profile);
  renderVersionBar();
  renderResume();
  markClean();
  if (migrated) { markDirty(); toast('已把旧版的「简历版本」转成独立简历,确认无误后保存'); }
  renderHealth();
  renderToc();
  renderMemory();
  renderBackupBanner();
}

async function save() {
  try {
    // 记录改动时间:用来判断「档案改过但还没备份」—— 比单纯的天数更有意义
    const { profile, altProfiles } = bundle();
    await store.set({ profile, altProfiles, profileUpdatedAt: Date.now() });
    toast('✅ 已保存');
    markClean();
    renderMemory();
    renderBackupBanner();
  } catch (e) { toast('保存失败:' + e.message, true); }
}

/* ============ 事件 ============ */
$('#btn-save').addEventListener('click', save);
$('#qa-add').addEventListener('click', () => {
  $('#qa-list').appendChild(qaRow());
  markDirty();
});
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
      const file = { name: f.name, type: f.type || 'application/pdf', size: f.size, dataBase64 };
      if (CUR === 'default') { await store.set({ resumeFile: file }); RESUME.base = file; }
      else { RESUME.files[CUR] = file; await store.set({ resumeFiles: RESUME.files }); }
      renderResume();
      toast(`✅ 已保存为「${verName(CUR)}」的附件`);
    } catch (e) { toast('保存失败:' + e.message, true); }
  };
  rd.readAsDataURL(f);
});

$('#resume-del').addEventListener('click', async () => {
  try {
    if (CUR === 'default') { await store.remove('resumeFile'); RESUME.base = null; }
    else { delete RESUME.files[CUR]; await store.set({ resumeFiles: RESUME.files }); }
    renderResume();
    toast('已删除简历附件');
  } catch (e) { toast('删除失败:' + e.message, true); }
});

$('#btn-export').addEventListener('click', async () => {
  let resumeFile = null, resumeFiles = {};
  try { ({ resumeFile, resumeFiles = {} } = await store.get(['resumeFile', 'resumeFiles'])); } catch { }
  const blob = new Blob([JSON.stringify({ ...bundle(), resumeFile, resumeFiles }, null, 2)], { type: 'application/json' });
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
  const cur = bundle().profile, inc = data.profile;
  const lines = [];
  for (const key of Object.keys(LIST_SPEC)) {
    const a = asList(cur[key]).length, b = asList(inc[key]).length;
    if (a || b) lines.push(`${LIST_TITLE[key]}  ${a} → ${b} 段${a === b ? '' : '  ◀'}`);
  }
  const basicDiff = Object.keys({ ...(cur.basic || {}), ...(inc.basic || {}) })
    .filter((k) => String((cur.basic || {})[k] || '') !== String((inc.basic || {})[k] || '')).length;
  lines.push(`基本信息  ${basicDiff ? basicDiff + ' 项不同' : '相同'}`);
  const nCur = Object.keys(DOCS).length, nInc = 1 + Object.keys(data.altProfiles || {}).length
    + ((inc.versions || []).length);
  if (nCur > 1 || nInc > 1) lines.push(`简历  ${nCur} → ${nInc} 份`);
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
      await store.set({ profile: data.profile, altProfiles: data.altProfiles || {} });
      if (data.resumeFile) await store.set({ resumeFile: data.resumeFile });
      if (data.resumeFiles && Object.keys(data.resumeFiles).length) await store.set({ resumeFiles: data.resumeFiles });
      await load();
      toast('✅ 导入成功');
    } catch (e) { toast('导入失败:' + e.message, true); }
  };
  rd.readAsText(f);
});

load();
