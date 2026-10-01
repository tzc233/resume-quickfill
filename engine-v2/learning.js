(() => {
  const V2 = window.__RQF_V2_PARTS;
  if (V2.learningInstalled) return;
  V2.learningInstalled = true;

  const api = (typeof browser !== 'undefined' && browser.storage) ? browser : chrome;
  const STORE = 'rqfV2LearnedSelections';
  const clean = (s) => String(s || '').replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .toLowerCase().replace(/[*：:()（）_\-]/g, ' ').replace(/\s+/g, ' ').trim();
  const framework = () => {
    const html = document.documentElement.innerHTML.slice(0, 250000);
    const src = Array.from(document.scripts).map((x) => x.src).join(' ');
    if (/moka|mokahr/i.test(src + html)) return 'ats:moka';
    if (/beisen|italent/i.test(src + html)) return 'ats:beisen';
    if (/mioffice|xiaomi\.jobs/i.test(location.hostname + src)) return 'ats:mioffice';
    if (document.querySelector('.ant-select,.ant-form-item')) return 'ui:antd';
    if (document.querySelector('.el-select,.el-form-item')) return 'ui:element';
    return '';
  };
  const platformScope = framework();
  // 相同组件库只代表交互相同，不代表不同站点的答案相同。
  const scopes = () => [`site:${location.hostname}`];
  const semanticKey = (field, hit) => {
    const path = hit?.spec?.key;
    if (path) return `field:${path}`;
    const label = clean(field?.text).replace(/请选择|请搜索|必填/g, '').trim();
    return label ? `label:${label.slice(0, 80)}` : '';
  };
  /* ---- 填空的记忆 ----
   * 下拉学会了、填空没学会:页面上那些档案里压根没有的问题(年龄、就读院系、
   * 证书编号…)每次都得手打一遍。这里把手填的内容按「站点 + 标签」记下来。
   *
   * 三条自我约束:
   *   · 只记【规则没认出来】的字段 —— 认出来的该由档案驱动,记一份既是重复
   *     存个人信息,也会让以后更新档案时被旧记忆盖掉;
   *   · 验证码/密码一类绝不记;
   *   · 同一个标签在页面上重复出现(重复的经历块)时带上序号,
   *     否则一个值会被灌进每一块 —— 那是比留空更糟的错。 */
  const TEXT_TYPES = new Set(['text', 'email', 'tel', 'url', 'search', 'number', '']);
  const SENSITIVE = /验证码|校验码|captcha|密码|password|口令|短信|动态码/i;
  const isTexty = (field) => !!field && (field.tag === 'textarea'
    || (field.tag === 'input' && !field.el.readOnly && field.role !== 'combobox'
      && TEXT_TYPES.has(field.el.type || 'text')
      && !field.el.closest('select,[role=combobox],.ant-select,.el-select,.aui-select,.phoenix-select')));
  const textLabel = (field) => clean(field?.text)
    .replace(/请填写|请输入|请选择|请上传|必填|选填/g, ' ').replace(/\s+/g, ' ').trim();
  const textKey = (field, fields) => {
    const label = textLabel(field);
    if (!label || label.length > 80 || SENSITIVE.test(label)) return '';
    const peers = fields.filter((f) => isTexty(f) && textLabel(f) === label);
    if (peers.length < 2) return `input:${label}`;
    const at = peers.indexOf(field) >= 0 ? peers.indexOf(field)
      : peers.findIndex((f) => f.el === field.el);
    // 认不回自己是第几个就别猜 —— 宁可这次不复用
    return at < 0 ? '' : `input:${label}#${at}`;
  };

  const selected = (field) => {
    const el = field.el;
    if (el.tagName === 'SELECT') {
      const option = el.selectedOptions?.[0];
      return option && option.value ? { text: option.textContent.trim(), value: option.value, adapter: 'native-select' } : null;
    }
    const owner = el.closest('.ant-select,.el-select,[class*="select"]') || el.parentElement;
    const text = clean(owner?.querySelector('.ant-select-selection-item,.el-input__inner,[class*="selected"],[class*="selection-item"]')?.textContent
      || el.value || owner?.textContent);
    return text && !/^(请选择|选择|please select)$/.test(text) ? { text, value: String(el.value || ''), adapter: 'popup-combobox' } : null;
  };
  const identify = (el) => {
    const fields = V2.discover();
    const field = fields.find((x) => x.el === el || x.el.contains(el) || el.contains(x.el) || el.closest?.('[role=combobox],select') === x.el);
    if (!field) return null;
    const index = fields.indexOf(field);
    return { field, fields, hit: V2.resolveAll(fields)[index] };
  };
  const save = async (field, hit, choice) => {
    const key = semanticKey(field, hit); if (!key || !choice?.text) return;
    const data = (await api.storage.local.get(STORE))[STORE] || {};
    for (const scope of scopes()) data[`${scope}|${key}`] = { ...choice, updatedAt: Date.now() };
    await api.storage.local.set({ [STORE]: data });
  };
  const capture = (el) => setTimeout(async () => {
    const found = identify(el); if (!found) return;
    await save(found.field, found.hit, selected(found.field));
  }, 80);

  const saveText = async (field, fields, text) => {
    const key = textKey(field, fields); if (!key) return;
    const data = (await api.storage.local.get(STORE))[STORE] || {};
    for (const scope of scopes()) data[`${scope}|${key}`] = { text, kind: 'text', updatedAt: Date.now() };
    await api.storage.local.set({ [STORE]: data });
  };
  const captureText = (el) => setTimeout(async () => {
    const text = String(el.value || '').trim();
    if (!text || text.length > 2000) return;
    const found = identify(el);
    // 规则认出来的字段交给档案,不进记忆
    if (!found || found.hit || !isTexty(found.field)) return;
    await saveText(found.field, found.fields, text);
  }, 80);

  document.addEventListener('change', (event) => {
    if (!event.isTrusted) return;
    const el = event.target.closest?.('select,[role=combobox],.ant-select,.el-select,.aui-select');
    if (el) { capture(el); return; }
    const box = event.target;
    if (box?.matches?.('input,textarea') && box.type !== 'password') captureText(box);
  }, true);
  document.addEventListener('click', (event) => {
    if (!event.isTrusted || !event.target.closest?.('[role=option],[role=treeitem],.ant-select-item-option,.el-select-dropdown__item,.aui-select-dropdown__item')) return;
    const open = Array.from(document.querySelectorAll('[role=combobox],select,.aui-select input')).find((el) => el.getAttribute('aria-expanded') === 'true' || el.matches(':focus'));
    if (open) capture(open);
  }, true);

  V2.learnedFor = async (field, hit) => {
    const key = semanticKey(field, hit); if (!key) return null;
    const data = (await api.storage.local.get(STORE))[STORE] || {};
    for (const scope of scopes()) if (data[`${scope}|${key}`]) return data[`${scope}|${key}`];
    return null;
  };
  V2.learnedTextFor = async (field, fields) => {
    const key = textKey(field, fields); if (!key) return null;
    const data = (await api.storage.local.get(STORE))[STORE] || {};
    for (const scope of scopes()) {
      const row = data[`${scope}|${key}`];
      if (row && row.text) return row.text;
    }
    return null;
  };
  V2.rememberSelection = save;
  V2.rememberText = saveText;
  V2.learningInfo = async () => {
    const data = (await api.storage.local.get(STORE))[STORE] || {};
    const keys = Object.keys(data);
    const here = keys.filter((key) => scopes().some((scope) => key.startsWith(`${scope}|`)));
    const texts = here.filter((key) => key.includes('|input:'));
    return { total: keys.length, current: here.length,
      currentText: texts.length, currentSelect: here.length - texts.length };
  };
  V2.clearLearningHere = async () => {
    const data = (await api.storage.local.get(STORE))[STORE] || {};
    const currentScopes = scopes();
    for (const key of Object.keys(data)) if (currentScopes.some((scope) => key.startsWith(`${scope}|`))) delete data[key];
    await api.storage.local.set({ [STORE]: data });
  };
})();
