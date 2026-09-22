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
    return { field, hit: V2.resolveAll(fields)[index] };
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

  document.addEventListener('change', (event) => {
    if (!event.isTrusted) return;
    const el = event.target.closest?.('select,[role=combobox],.ant-select,.el-select,.aui-select');
    if (el) capture(el);
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
  V2.rememberSelection = save;
  V2.learningInfo = async () => {
    const data = (await api.storage.local.get(STORE))[STORE] || {};
    return { total: Object.keys(data).length, current: Object.keys(data).filter((key) => scopes().some((scope) => key.startsWith(`${scope}|`))).length };
  };
  V2.clearLearningHere = async () => {
    const data = (await api.storage.local.get(STORE))[STORE] || {};
    const currentScopes = scopes();
    for (const key of Object.keys(data)) if (currentScopes.some((scope) => key.startsWith(`${scope}|`))) delete data[key];
    await api.storage.local.set({ [STORE]: data });
  };
})();
