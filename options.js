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

function entryRow(listKey, data = {}, idx = 0) {
  const spec = LIST_SPEC[listKey];
  const box = document.createElement('div');
  box.className = 'entry';
  box.innerHTML = `<div class="entry-head"><span class="entry-no">第 ${idx + 1} 段</span>
    <button class="ghost danger entry-del" title="删除这一段">✕ 删除</button></div>
    <div class="grid entry-grid"></div>`;
  const grid = box.querySelector('.entry-grid');

  for (const f of spec.fields) {
    const lab = document.createElement('label');
    if (f.full) lab.className = 'span-all';
    lab.append(f.l);
    let ctrl;
    if (f.type === 'select') {
      ctrl = document.createElement('select');
      for (const o of f.opts) ctrl.append(new Option(o, o));
    } else if (f.type === 'textarea') {
      ctrl = document.createElement('textarea');
      ctrl.rows = 3;
    } else {
      ctrl = document.createElement('input');
      if (f.type) ctrl.type = f.type;
    }
    if (f.ph) ctrl.placeholder = f.ph;
    ctrl.dataset.k = f.k;
    ctrl.value = data[f.k] ?? '';
    lab.append(ctrl);
    grid.append(lab);
  }
  box.querySelector('.entry-del').addEventListener('click', () => {
    box.remove();
    renumber(listKey);
  });
  return box;
}

function renumber(listKey) {
  const wrap = document.querySelector(`[data-list="${listKey}"] .list`);
  [...wrap.children].forEach((c, i) => { c.querySelector('.entry-no').textContent = `第 ${i + 1} 段`; });
}

function renderList(listKey, items) {
  const wrap = document.querySelector(`[data-list="${listKey}"] .list`);
  wrap.innerHTML = '';
  (items || []).forEach((it, i) => wrap.append(entryRow(listKey, it, i)));
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
    wrap.append(entryRow(key, {}, wrap.children.length));
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
  div.querySelector('.qa-del').addEventListener('click', () => div.remove());
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
  if (rf && rf.name) {
    info.textContent = `📎 已保存:${rf.name}(${(rf.size / 1024).toFixed(0)} KB)`;
    del.hidden = false;
  } else {
    info.textContent = '未上传。上传后,遇到「上传简历 / Resume / CV / 附件」类控件会自动注入该文件。';
    del.hidden = true;
  }
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
  for (const el of $$('[data-path]')) el.value = getPath(profile, el.dataset.path) ?? '';
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
  renderBackupBanner();
}

async function save() {
  try {
    // 记录改动时间:用来判断「档案改过但还没备份」—— 比单纯的天数更有意义
    await store.set({ profile: collectProfile(), profileUpdatedAt: Date.now() });
    toast('✅ 已保存');
    renderBackupBanner();
  } catch (e) { toast('保存失败:' + e.message, true); }
}

/* ============ 事件 ============ */
$('#btn-save').addEventListener('click', save);
$('#qa-add').addEventListener('click', () => $('#qa-list').appendChild(qaRow()));

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

$('#btn-import').addEventListener('change', (ev) => {
  const f = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  const rd = new FileReader();
  rd.onload = async () => {
    try {
      const data = JSON.parse(String(rd.result));
      if (!data || typeof data !== 'object' || !data.profile) throw new Error('格式不正确');
      await store.set({ profile: data.profile });
      if (data.resumeFile) await store.set({ resumeFile: data.resumeFile });
      await load();
      toast('✅ 导入成功');
    } catch (e) { toast('导入失败:' + e.message, true); }
  };
  rd.readAsText(f);
});

load();
