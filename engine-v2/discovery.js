(() => {
  const V2 = window.__RQF_V2_PARTS;
  V2.selectionOwner = el => el.closest('.ant-select,.el-select,.aui-select,.phoenix-select,.ud__select,[class*="sd-Dropdown"],[class*="sd-Select"]') || el.closest('select,[role=combobox]');
  V2.isSelection = field => !!V2.selectionOwner(field.el);
  V2.readControlValue = ({el}) => {
    const valid = value => /^(请选择.*|请输入.*|please select.*|select an? .*|选择|证件)$/i.test(String(value).trim()) ? '' : String(value || '').trim();
    if (el.tagName === 'SELECT') {
      const options = Array.from(el.selectedOptions || []).filter(o => !o.disabled && valid(o.textContent));
      return options.map(o => valid(o.textContent) || o.value).join('、');
    }
    if (el.matches('input[type=radio],input[type=checkbox]')) return el.checked ? el.value || 'checked' : '';
    if (el.isContentEditable) return valid(el.textContent);
    const owner = V2.selectionOwner(el) || el;
    const selectors = '.phoenix-select__tipEle,.ant-select-selection-item,.ant-select-selection-placeholder,.ant-select-selection-selected-value,.ant-select-selection__rendered > [title],.el-select__selected-item,.el-select__tags-text,.aui-select__tags-text,[class*="display-value"],[class*="selection-item"],[class*="selection-selected-value"],[class*="picker-label"]';
    const shown = Array.from(owner.querySelectorAll(selectors)).map(n => valid(n.textContent)).filter(Boolean);
    if (shown.length) return shown.join('、');
    const inputs = owner.matches('input,textarea') ? [owner] : Array.from(owner.querySelectorAll('input:not([type=hidden]),textarea'));
    // Search input text is not a committed selection, except read-only date/select displays.
    const values = inputs.filter(n => !V2.selectionOwner(n) || n.readOnly || !/search/i.test(n.type + ' ' + n.className) && !n.matches('.phoenix-select__input,.ant-select-selection-search-input'))
      .map(n => valid(n.value)).filter(Boolean);
    return values.join('、') || valid(owner.getAttribute('aria-valuetext') || '');
  };
  V2.readValue = V2.readControlValue;
  const clean = (s) => String(s || '').replace(/([a-z\d])([A-Z])/g, '$1 $2').toLowerCase().replace(/[*：:()（）_\-]/g, ' ').replace(/\s+/g, ' ').trim();
  /* 上溯取「容器文字减去通往控件的那一支」—— 剩下的就是标签。
   * 这条是兜底,但不可或缺:飞书招聘(小鹏等)的标签既不在 label[for]、
   * 也不在 aria-*,容器叫 ud-formily-item,任何类名白名单都对不上 ——
   * v2 因此在那一页 40 个控件里一个标签都没读到,整条流水线填 0 项,
   * 而带上溯逻辑的 1.x 在同一页填上了 13 项。
   * 多控件容器要停:再往上拿到的是隔壁字段标签拼起来的一坨。 */
  /* up 里有没有「不属于当前控件这一支」的其它控件 —— 有就说明它是多字段容器 */
  const outsideControls = (up, node) => Array.from(
    up.querySelectorAll('input,textarea,select,[role=combobox]')
  ).some((c) => !node.contains(c));

  const ancestorLabel = (el) => {
    let node = el;
    for (let depth = 0; depth < 12 && node.parentElement; depth++) {
      const up = node.parentElement;
      if (up === document.body) break;
      /* 找真正的标签节点(飞书是 .ud-formily-item-label),排除包含控件的那一支。
       * 判据是「这一层只有一个标签文本」:只有一个就是本字段的,多于一个说明
       * 已经爬到多字段容器,停手。
       * 不再用「本分支外还有控件就停」—— 起止日期是【同一个表单项里的两个】
       * 输入框,那条一触即发,标签还没爬到就收手,日期于是完全没有标签、
       * 连规则都匹配不上,「日期没选上」就是这么来的。 */
      const marks = [...new Set(Array.from(
        up.querySelectorAll('label,[class*="label"],[class*="title"]'))
        .filter((c) => !c.contains(el))
        .map((c) => clean(c.textContent))
        .filter((t) => t && t.length <= 40))];
      if (marks.length === 1) return marks[0];
      if (marks.length > 1) break;
      node = up;
    }
    /* 还是没有,才退回「容器文字减去通往控件的那一支」。 */
    node = el;
    for (let depth = 0; depth < 12 && node.parentElement; depth++) {
      const up = node.parentElement;
      if (up === document.body) break;
      if (outsideControls(up, node)) break;
      const whole = clean(up.textContent);
      const inner = clean(node.textContent);
      let rest = whole;
      if (inner) {
        const at = whole.indexOf(inner);
        rest = clean(at < 0 ? whole : whole.slice(0, at) + ' ' + whole.slice(at + inner.length));
      }
      if (rest && rest.length <= 40) return rest;
      node = up;
    }
    return '';
  };

  const labelText = (el) => {
    const id = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    const box = el.closest('.ant-form-item,.aui-form-item,.form-item,.field,[class*="formItem"],[class*="field"]');
    const labelledBy = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
      .map((key) => document.getElementById(key)?.textContent).filter(Boolean).join(' ');
    const wrapped = el.closest('label');
    const wrapperLabel = wrapped?.cloneNode(true);
    wrapperLabel?.querySelectorAll('input,select,textarea,[role=combobox]').forEach((node) => node.remove());
    return clean([id && id.textContent, labelledBy, wrapperLabel?.textContent, el.getAttribute('aria-label'), el.placeholder, el.id, el.name,
      box && box.querySelector('label,.ant-form-item-label,.aui-form-item__label,[class*="label"]')?.textContent]
      .filter(Boolean).join(' ')) || ancestorLabel(el);
  };
  const metadata = (el) => {
    const children = el.querySelectorAll ? el.querySelectorAll('input,textarea,select') : [];
    return [el, ...children].flatMap((node) => [node.id, node.name, node.getAttribute?.('data-path'), node.getAttribute?.('data-field')])
      .filter(Boolean).join(' ');
  };
  const sectionOf = (el) => {
    let node = el;
    /* 上溯层数要够深。讯飞的 phoenix-select 在控件和表单项之间垫了 7 层包装
     * (unmodeled-layer / inner / protect / content + select + ul + li),
     * 区块标题正好落在第 20 层外 —— 同一个教育区块里,普通文本框认得出 education,
     * 隔壁的「学历」下拉就报「未识别字段」。循环本来就以 document.body 收口,
     * 而且只接受能对上别名表的短标题,放深不会乱认。 */
    for (let depth = 0; depth < 40 && node && node !== document.body; depth++, node = node.parentElement) {
      const heading = node.querySelector?.(':scope > h1,:scope > h2,:scope > h3,:scope > legend,:scope > .title,:scope > .titles,:scope > [class*="section-title"],:scope > [class*="module-title"]');
      const text = clean(heading && heading.textContent);
      const hit = V2.sectionAliases.find(([re]) => re.test(text));
      if (hit) return { domain: hit[1], text, node };
      /* 有些 ATS 把区块标题渲染成没有语义标签的 div。原来这里是一张写死的
       * 区块名白名单 —— 飞书的「语言能力」不在表里,于是 8 个语言下拉全部
       * section 为空、域规则绑不上、key 也就是 null,获奖同理。
       * 改成三条一起卡:文字短、能对上别名表、且该层只有这一个。 */
      const titles = Array.from(node.children).filter((child) => {
        if (child.contains(el) || child.querySelector('input,textarea,select')) return false;
        const t = clean(child.textContent);
        return t && t.length <= 10 && V2.sectionAliases.some(([re]) => re.test(t));
      });
      if (titles.length === 1) {
        const text = clean(titles[0].textContent);
        const hit = V2.sectionAliases.find(([re]) => re.test(text));
        if (hit) return { domain: hit[1], text, node };
      }
    }
    return null;
  };
  const pathHint = (el, text) => {
    const raw = [metadata(el), text].filter(Boolean).join(' ')
      .replace(/_/g, ' ').replace(/([a-z\d])([A-Z])/g, '$1 $2').toLowerCase();
    const direct = [
      [/preferred\s*city\s*list|expected\s*city|intention\s*city/, 'basic.expectedCity'],
      [/current\s*city\s*code|current\s*location/, 'basic.city'],
      [/hometown\s*city\s*code|native\s*place/, 'basic.hometown'],
      [/id\s*type|document\s*type/, 'basic.idType'],
      [/id\s*number/, 'basic.idNumber'],
    ].find(([re]) => re.test(raw));
    if (direct) return direct[1];
    const m = raw.match(/\b(education|internship|practice|work|project|award|language)s?(?:\s*list|\s*background)?[.\s_-]*(?:\[\s*)?(\d+)(?:\s*\])?[.\s_-]*([a-z ]{2,40})/i);
    if (!m) return null;
    const def = V2.pathAliases[m[1].toLowerCase()]; if (!def) return null;
    const tail = m[3].trim();
    const field = Object.keys(def[1]).sort((a, b) => b.length - a.length).find((key) => tail.startsWith(key));
    return field ? `${def[0]}.${Number(m[2])}.${def[1][field]}` : null;
  };
  V2.discover = () => Array.from(document.querySelectorAll('input:not([type=hidden]),textarea,select,[role=combobox],[aria-haspopup=listbox],[contenteditable=true]'))
    .filter((el) => !el.parentElement?.closest('[role=combobox]'))
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && !el.disabled && !el.closest('[inert],[aria-hidden=true]') && getComputedStyle(el).visibility !== 'hidden'; })
    .map((el) => { const text = labelText(el), section = sectionOf(el); return { el, text, section,
      pathHint: pathHint(el, text), tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '' }; });
  V2.inventory = () => {
    const nodes = Array.from(document.querySelectorAll('input,textarea,select,[role=combobox],[role=listbox],[role=dialog]'));
    const controls = nodes.map((el) => { const r = el.getBoundingClientRect(); return {
      tag: el.tagName.toLowerCase(), type: el.type || '', role: el.getAttribute('role') || '',
      visible: r.width > 2 && r.height > 2, label: labelText(el).slice(0, 80),
      hasPopup: el.getAttribute('aria-haspopup') || '', hasControls: !!el.getAttribute('aria-controls'),
      readOnly: !!el.readOnly, disabled: !!el.disabled,
      section: sectionOf(el)?.domain || null,
      ancestors: (() => {
        const result = []; let node = el.parentElement;
        for (let depth=0;depth<20 && node && node!==document.body;depth++,node=node.parentElement) {
          result.push({tag:node.tagName.toLowerCase(), class: String(node.className || ''),
            headings:Array.from(node.children).filter(child => !child.contains(el) && !child.querySelector('input,textarea,select') &&
              /^(教育经历|教育背景|实习经历|工作经历|项目经历|项目经验|在校实践|获奖情况|获奖经历|论文\/专著|论文成果|证书|个人信息)$/.test(clean(child.textContent)))
              .map(child => clean(child.textContent))});
        }
        return result;
      })(),
      structure: (() => {
        const clone = (el.closest('.aui-form-item,.ant-form-item,.form-item') || el.parentElement || el).cloneNode(true);
        const nodes = [clone, ...clone.querySelectorAll('*')];
        for (const node of nodes) {
          for (const attr of Array.from(node.attributes || [])) if (!['class','role','type','readonly','disabled','aria-haspopup'].includes(attr.name)) node.removeAttribute(attr.name);
          for (const child of Array.from(node.childNodes)) if (child.nodeType === 3) child.textContent = '[文]';
          for (const child of Array.from(node.childNodes)) if (child.nodeType === 8) child.remove();
        }
        return clone.outerHTML.slice(0, 2500);
      })(),
    }; });
    const adders = Array.from(document.querySelectorAll('button,[role=button]')).map((el) => clean(el.textContent))
      .filter((t) => /添加|新增|增加|add/.test(t) && !/删除|保存|提交/.test(t)).slice(0, 30);
    return { total: controls.length, visible: controls.filter((x) => x.visible).length,
      hidden: controls.filter((x) => !x.visible).length, ariaLinked: controls.filter((x) => x.hasControls).length,
      adders, controls };
  };
  V2.expandEmptySections = async () => {
    const expanded = [];
    const buttons = Array.from(document.querySelectorAll('button,[role=button]'));
    for (const button of buttons) {
      const text = clean(button.textContent);
      if (!/^(\+\s*)?(添加|新增|增加).{0,16}(经历|背景|能力|项目|论文|语言|奖项|荣誉)/.test(text)) continue;
      const box = button.closest('.moduleBlock,section,[class*="module"],[class*="section"]') || button.parentElement;
      if (!box || box.querySelector('input:not([type=hidden]),textarea,select,[role=combobox]')) continue;
      button.click(); expanded.push(text.slice(0, 40));
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    return expanded;
  };
  V2.resolve = (field) => {
    if (['checkbox','radio','file'].includes(field.el.type)) return null;
    const autocomplete = field.el.autocomplete?.split(/\s+/).pop();
    const standard = { name: 'basic.fullName', email: 'basic.email', tel: 'basic.phone', 'tel-national': 'basic.phone' };
    if (standard[autocomplete]) return { spec: { key: standard[autocomplete] }, score: 100 };
    const select = field.tag === 'select' || field.role === 'combobox' || !!field.el.closest('.ant-select,.el-select,.aui-select');
    if (/证件/.test(field.text) && !/国家|地区|签发/.test(field.text)) {
      return { spec: { key: select ? 'basic.idType' : 'basic.idNumber', terms: [] }, score: 100 };
    }
    if (/区号|国家代码/.test(field.text) || field.el.closest('.areaCode-box')) return null;
    if (field.pathHint) return { spec: { key: field.pathHint, terms: [], source: 'machine-path' }, score: 100 };
    let best = null;
    for (const spec of V2.schema) {
      if (spec.key === 'basic.idType' && /国家|地区|签发/.test(field.text)) continue;
      if (spec.domain && (!field.section || field.section.domain !== spec.domain)) continue;
      if ((spec.exclude || []).some((x) => field.text.includes(clean(x)))) continue;
      const score = spec.terms.reduce((n, x) => {
        const term = clean(x);
        const matches = /^[a-z ]+$/.test(term)
          ? (` ${field.text} `).includes(` ${term} `) : field.text.includes(term);
        return n + (matches ? term.length : 0);
      }, 0);
      if (score && (!best || score > best.score)) best = { spec, score };
    }
    return best;
  };
  V2.resolveAll = (fields) => {
    const state = {}, records = {};
    return fields.map((field) => {
      const hit = V2.resolve(field); if (!hit || hit.spec.key || !hit.spec.domain) return hit;
      const domain = hit.spec.domain; state[domain] ||= { index: 0, seen: new Set() };
      const record = field.el.closest('.ux-standard-form');
      if (record && field.section) {
        records[domain] ||= [];
        if (!records[domain].includes(record)) records[domain].push(record);
        return { ...hit, spec: { ...hit.spec, key: `${domain}.${records[domain].indexOf(record)}.${hit.spec.field}` } };
      }
      if (hit.spec.anchor && state[domain].seen.has(hit.spec.field)) { state[domain].index++; state[domain].seen.clear(); }
      state[domain].seen.add(hit.spec.field);
      return { ...hit, spec: { ...hit.spec, key: `${domain}.${state[domain].index}.${hit.spec.field}` } };
    });
  };
})();
