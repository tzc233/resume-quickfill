(() => {
  const V2 = window.__RQF_V2_PARTS;
  if (V2.learningInstalled) return;
  V2.learningInstalled = true;

  const api = (typeof browser !== 'undefined' && browser.storage) ? browser : chrome;
  const STORE = 'rqfV2LearnedSelections';
  const clean = (s) => String(s || '').replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .toLowerCase().replace(/[*：:()（）_\-]/g, ' ').replace(/\s+/g, ' ').trim();
  /* 原来这里在每个网页加载时把整页 innerHTML 序列化一遍,用来猜组件库 ——
   * 结果从没被用上(记忆早已只按站点存),白白在每个页面、每个 iframe 上付一次整页序列化。 */
  // 相同组件库只代表交互相同，不代表不同站点的答案相同。
  const scopes = () => [`site:${location.hostname}`];
  const semanticKey = (field, hit, known) => {
    const path = hit?.spec?.key;
    if (path) return `field:${path}`;
    const label = clean(field?.text).replace(/请选择|请搜索|必填/g, '').trim();
    if (!label) return '';
    // 调用方手里已经有一份全页扫描时直接用 —— discover 在大页面上是百毫秒级
    const peers = (known || V2.discover()).filter(f => clean(f.text).replace(/请选择|请搜索|必填/g,'').trim() === label);
    const at=peers.findIndex(f=>f.el===field.el);
    return peers.length>1 ? (at<0?'':`label:${label.slice(0,80)}#${at}`) : `label:${label.slice(0,80)}`;
  };
  /* ---- 填空的记忆 ----
   * 下拉学会了、填空没学会:页面上那些档案里压根没有的问题(年龄、就读院系、
   * 证书编号…)每次都得手打一遍。这里把手填的内容按「站点 + 标签」记下来。
   *
   * 三条自我约束:
   *   · 档案有值时始终优先；识别出的字段记忆只补档案缺值;
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
      return option && V2.readControlValue(field) ? { text: option.textContent.trim(), value: option.value, adapter: 'native-select' } : null;
    }
    const text = V2.readControlValue(field);
    return text ? { text, value: '', adapter: 'popup-combobox' } : null;
  };
  const identify = (el) => {
    const fields = V2.discover();
    const field = fields.find((x) => x.el === el || x.el.contains(el) || el.contains(x.el) || el.closest?.('[role=combobox],select') === x.el);
    if (!field) return null;
    const index = fields.indexOf(field);
    return { field, fields, hit: V2.resolveAll(fields)[index] };
  };
  let writes = Promise.resolve();
  const update = (key, row) => {
    const task = writes.then(async () => {
    const data = (await api.storage.local.get(STORE))[STORE] || {};
    for (const scope of scopes()) {
      if (row) data[`${scope}|${key}`] = {...row, updatedAt:Date.now()};
      else delete data[`${scope}|${key}`];
    }
    await api.storage.local.set({ [STORE]: data });
    });
    writes = task.catch(() => {}); return task;
  };
  const save = async (field, hit, choice, fields) => {
    const key = semanticKey(field, hit, fields); if (!key || SENSITIVE.test(field.text)) return;
    return update(key, choice?.text ? choice : null);
  };
  const capture = (el) => setTimeout(async () => {
    if (V2.fillInFlight) return;
    const found = identify(el); if (!found) return;
    await save(found.field, found.hit, selected(found.field), found.fields);
  }, 80);

  const saveText = async (field, fields, text, hit) => {
    if (!isTexty(field) || SENSITIVE.test(field.text) || String(text).length > 2000) return;
    const key = hit?.spec?.key ? `text:${hit.spec.key}` : textKey(field, fields); if (!key) return;
    return update(key, text ? {text,kind:'text'} : null);
  };
  const captureText = (el, text = String(el.value || '').trim()) => setTimeout(async () => {
    if (text.length > 2000) return;
    const found = identify(el);
    // 识别出的字段按语义路径存储，复用时档案优先。
    if (!found || !isTexty(found.field)) return;
    await saveText(found.field, found.fields, text, found.hit);
  }, 80);

  /* ---- 只在用过插件的站点上监听 ----
   * 这个脚本随 content_scripts 注入每一个网页、每一个 iframe。原来五个监听器无条件挂上:
   * 任何网站上每打一段字、每点一个下拉,都要做一次全页 discover + resolveAll ——
   * 300 个输入框的页面上每次停顿主线程卡 ~180ms,规模再大就是秒级;
   * 而且搜索框、评论框里打的字也被当成「手动填写」记进了本地存储。
   * 现在:某站点第一次点「一键填充」时启用并记下这个站点,以后该站点一加载就挂上;
   * 其余网站只付一次小小的存储读取,不挂任何监听。 */
  const SITES = 'rqfV2LearnSites';
  let armed = false;
  const listen = () => {
    document.addEventListener('change', (event) => {
      if (!event.isTrusted || V2.fillInFlight) return;
      const el = V2.selectionOwner(event.target);
      if (el) { capture(el); return; }
      const box = event.target;
      if (box?.matches?.('input,textarea') && box.type !== 'password') captureText(box);
    }, true);
    let activeSelection = null;
    document.addEventListener('pointerdown', event => {
      if (!event.isTrusted || V2.fillInFlight) return;
      const owner=V2.selectionOwner(event.target);
      if(owner){activeSelection=identify(owner);if(activeSelection)activeSelection.before=V2.readControlValue(activeSelection.field);}
    },true);
    document.addEventListener('focusin', event => {
      if (!event.isTrusted) return;
      const owner = V2.selectionOwner(event.target);
      if (owner) {
        activeSelection = identify(event.target);
        if (activeSelection) activeSelection.before = V2.readControlValue(activeSelection.field);
      }
    }, true);
    const textTimers = new WeakMap();
    document.addEventListener('input', event => {
      if (!event.isTrusted || V2.fillInFlight) return;
      const el=event.target;
      if (!el.matches?.('input,textarea') || V2.selectionOwner(el)) return;
      clearTimeout(textTimers.get(el));
      const text=String(el.value || '').trim();
      textTimers.set(el,setTimeout(()=>captureText(el,text),400));
    },true);
    document.addEventListener('click', (event) => {
      if (!event.isTrusted || V2.fillInFlight) return;
      const owner=V2.selectionOwner(event.target);
      if(owner && !activeSelection){ activeSelection=identify(owner); if(activeSelection) activeSelection.before=V2.readControlValue(activeSelection.field); }
      if (!activeSelection && !event.target.closest?.('[role=option],[role=treeitem],.ant-select-item-option,.ant-select-dropdown-menu-item,.el-select-dropdown__item,.aui-select-dropdown__item')) return;
      if (activeSelection) {
        const previous = activeSelection;
        setTimeout(async()=>{
          if (V2.fillInFlight) return;
          const fields=V2.discover(),hits=V2.resolveAll(fields);
          const matches=fields.filter((f,i)=>semanticKey(f,hits[i],fields)===semanticKey(previous.field,previous.hit,fields));
          const current=matches.find(f=>f.el===previous.field.el) || (matches.length===1?matches[0]:null);
          if(current && V2.readControlValue(current)!==previous.before) await save(current,previous.hit,selected(current),fields);
        },180);
      }
    }, true);

  };
  V2.armLearning = async (persist) => {
    if (!armed) { armed = true; listen(); }
    if (!persist) return;
    const task = writes.then(async () => {
      const sites = (await api.storage.local.get(SITES))[SITES] || {};
      if (sites[location.hostname]) return;
      sites[location.hostname] = Date.now();
      await api.storage.local.set({ [SITES]: sites });
    });
    writes = task.catch(() => {}); return task;
  };
  Promise.resolve().then(() => api.storage.local.get(SITES))
    .then((d) => { if (((d && d[SITES]) || {})[location.hostname]) V2.armLearning(false); })
    .catch(() => {});

  // fields:调用方已有的全页扫描。不传就每个下拉各扫一遍全页 —— 填充时是 O(N²)
  V2.learnedFor = async (field, hit, fields) => {
    await writes;
    const key = semanticKey(field, hit, fields || undefined); if (!key) return null;
    const data = (await api.storage.local.get(STORE))[STORE] || {};
    for (const scope of scopes()) if (data[`${scope}|${key}`]) return data[`${scope}|${key}`];
    return null;
  };
  V2.learnedTextFor = async (field, fields, hit) => {
    await writes;
    if (!isTexty(field) || SENSITIVE.test(field.text)) return null;
    const key = hit?.spec?.key ? `text:${hit.spec.key}` : textKey(field, fields); if (!key) return null;
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
    await writes;
    const data = (await api.storage.local.get(STORE))[STORE] || {};
    const keys = Object.keys(data);
    const here = keys.filter((key) => scopes().some((scope) => key.startsWith(`${scope}|`)));
    const texts = here.filter((key) => key.includes('|input:') || key.includes('|text:'));
    return { total: keys.length, current: here.length,
      currentText: texts.length, currentSelect: here.length - texts.length };
  };
  V2.clearLearningHere = () => {
    const task = writes.then(async () => {
    const data = (await api.storage.local.get(STORE))[STORE] || {};
    const currentScopes = scopes();
    for (const key of Object.keys(data)) if (currentScopes.some((scope) => key.startsWith(`${scope}|`))) delete data[key];
    await api.storage.local.set({ [STORE]: data });
    });
    writes = task.catch(() => {}); return task;
  };
})();
