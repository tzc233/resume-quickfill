(() => {
  const V2 = window.__RQF_V2_PARTS;
  /* 只用于「这个控件该由哪个适配器驱动」,不参与字段语义判断。
   * 讯飞(zhiye.com)的 phoenix-select 没有 role=combobox、没有 aria-haspopup、
   * 也没有 aria-controls —— 三条通用判据一条都不满足,而 nativeText 又显式排除了它,
   * 结果 20 个控件两头都不收,整页 2.x 流水线填 0 项。 */
  const ownerSelector = '.ant-select,.el-select,.aui-select,.phoenix-select';
  const emit = (el, value) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter ? setter.call(el, value) : (el.value = value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const nativeTextTypes = new Set(['text', 'email', 'tel', 'url', 'search', 'number', '']);
  const nativeText = { id: 'native-text', supports: (f) => !f.el.closest('.phoenix-select') && (f.tag === 'textarea' || (f.tag === 'input' && !f.el.readOnly && f.role !== 'combobox' && nativeTextTypes.has(f.el.type || 'text'))),
    async write(f, value) { emit(f.el, value); return String(f.el.value) === String(value); } };
  const nativeSelect = { id: 'native-select', supports: (f) => f.tag === 'select', async write(f, value, spec) {
    const learned = value && typeof value === 'object' ? value : null;
    const wanted = String(learned?.value || learned?.text || value).toLowerCase();
    const aliases = learned ? [learned.text, learned.value].filter(Boolean) : ((spec.enum && spec.enum[value]) || [value]);
    const option = Array.from(f.el.options).find((o) => aliases.some((a) => o.textContent.trim().toLowerCase() === String(a).toLowerCase()) || o.value.toLowerCase() === wanted);
    if (!option) return false; f.el.value = option.value; f.el.dispatchEvent(new Event('change', { bubbles: true })); return f.el.value === option.value;
  } };
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden'; };
  /* 选项行的结构化兜底。类名选择器只认得几家组件库,遇到没见过的(讯飞 phoenix 就是)
   * 一无所获。但「弹层里一组同父、同标签、同 class 的短文本兄弟节点」是所有下拉
   * 共有的 DOM 规律,与组件库无关。
   * 安全性来自调用方:下面只会点【文本完全等于目标值】的那一项 ——
   * 即使这里认错了一组节点,也不会误点出一个错误的选择。 */
  const structuralOptions = (added) => {
    const byParent = new Map();
    for (const el of added) {
      if (!el.isConnected || !visible(el)) continue;
      if (el.querySelector('input,textarea,select')) continue;   // 那是容器,不是选项
      const text = (el.textContent || '').trim();
      if (!text || text.length > 40) continue;
      const parent = el.parentElement;
      if (!parent) continue;
      let groups = byParent.get(parent);
      if (!groups) byParent.set(parent, groups = new Map());
      const key = el.tagName + '|' + (typeof el.className === 'string' ? el.className : '');
      const list = groups.get(key) || [];
      list.push(el); groups.set(key, list);
    }
    let best = [];
    for (const groups of byParent.values()) {
      for (const list of groups.values()) {
        // 至少两行,且文本不能全都一样(一样的多半是装饰而不是选项)
        if (list.length < 2 || list.length <= best.length) continue;
        if (new Set(list.map((o) => o.textContent.trim())).size < 2) continue;
        best = list;
      }
    }
    return best;
  };
  const combo = { id: 'popup-combobox', supports: (f) => f.role === 'combobox' || f.el.getAttribute('aria-haspopup') === 'listbox' || !!f.el.closest(ownerSelector), async write(f, value, spec) {
    const trigger = f.el;
    const learned = value && typeof value === 'object' ? value : null;
    const aliases = learned ? [learned.text, learned.value].filter(Boolean) : ((spec.enum && spec.enum[value]) || [value]);
    const norm = (x) => String(x || '').trim().toLowerCase().replace(/\s+/g, '');
    // 读值交给 V2.readValue —— 它已经知道 phoenix 的值在 tipEle 里,不在 input 上
    if (aliases.some((a) => norm(V2.readValue(f)) === norm(a))) return true;
    const optionSelector = '[role=option],[role=treeitem],.ant-select-item-option,.ant-select-dropdown-menu-item,.el-select-dropdown__item,.aui-select-dropdown__item,.aui-select-dropdown li';
    const before = new Set(Array.from(document.querySelectorAll(optionSelector)).filter(visible));
    /* 结构化兜底需要知道「这一次点击之后新出现了什么」。弹层有两种出现方式:
     * 新挂上 DOM,或者本来就在、靠 class/style 切换可见 —— 两种都要盯。 */
    const added = new Set();
    const note = (n) => { if (n && n.nodeType === 1) { added.add(n); for (const d of n.querySelectorAll('*')) added.add(d); } };
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'attributes') note(m.target);
        else for (const n of m.addedNodes) note(n);
      }
    });
    mo.observe(document.documentElement,
      { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    const done = (v) => { mo.disconnect(); return v; };
    trigger.focus(); trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); trigger.click();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
    let options = [], target = null, searched = false, scrolls = 0;
    const originalSearch = trigger.value || '';
    for (let n = 0; n < 60 && !target; n++) {
      await new Promise((r) => setTimeout(r, 50));
      const controlled = f.el.getAttribute('aria-controls') || f.el.getAttribute('aria-owns');
      const scope = controlled && document.getElementById(controlled.split(/\s+/)[0]);
      options = Array.from((scope || document).querySelectorAll(optionSelector)).filter((o) => visible(o) && (scope || !before.has(o)) && o.getAttribute('aria-disabled') !== 'true');
      options = options.filter((o) => !o.matches('.is-disabled,[disabled]'));
      if (!options.length) options = structuralOptions(added);   // 没见过的组件库走结构判断
      let matches = options.filter((o) => aliases.some((a) => norm(o.textContent) === norm(a)));
      /* 精确匹配不到时受控放宽一档:允许「唯一包含」。
       * 档案写「深圳」页面给「深圳市」、档案写「硕士」页面给「硕士研究生」——
       * 讯飞这一版 5 个下拉全卡在这里(选项找到了,文字对不上)。
       * 但必须【唯一】:多于一个就宁可留空,不猜。 */
      if (!matches.length) {
        const loose = options.filter((o) => {
          const t = norm(o.textContent);
          return t.length >= 2 && aliases.some((a) => {
            const x = norm(a);
            return x.length >= 2 && (t.includes(x) || x.includes(t));
          });
        });
        if (loose.length === 1) matches = loose;
        else if (loose.length > 1) f.looseCandidates = loose.length;
      }
      // 嵌套时只留最内层:结构化兜底会同时收下外层 li 和内层 span,两者文本相同
      matches = matches.filter((m) => !matches.some((o) => o !== m && m.contains(o)));
      if (matches.length === 1) target = matches[0];
      if (matches.length > 1) { f.failure = '多个同名候选，无法唯一选择'; break; }
      if (!target && n === 8 && trigger.tagName === 'INPUT' && !trigger.readOnly) {
        emit(trigger, aliases[0]); searched = true;
      }
      if (!target && n > 12 && n % 5 === 0 && scrolls < 8) {
        let scroller = options[0]?.parentElement || scope;
        while (scroller && scroller !== document.body && scroller.scrollHeight <= scroller.clientHeight + 2) scroller = scroller.parentElement;
        if (scroller && scroller !== document.body) {
          scroller.scrollTop += Math.max(40, scroller.clientHeight * 0.8);
          scroller.dispatchEvent(new Event('scroll', { bubbles: true })); scrolls++;
        }
      }
    }
    if (!target) {
      if (searched) emit(trigger, originalSearch);
      /* 把实际看到的选项写进失败原因。只说「未找到唯一匹配」没法排查 ——
       * 到底是弹层没开、还是开了但文字对不上,两种修法完全不同;
       * 而且不知道页面给的是「硕士」还是「硕士研究生」,别名就只能猜。 */
      const seen = options.map((o) => String(o.textContent || '').trim().slice(0, 16))
        .filter(Boolean).slice(0, 12);
      f.failure ||= options.length
        ? `想选「${aliases[0]}」,但${options.length} 个选项都对不上`
          + (f.looseCandidates ? `(放宽后有 ${f.looseCandidates} 个都沾边,不唯一,未猜)` : '')
          + `;看到的选项:${seen.join('、')}${options.length > seen.length ? ' …' : ''}`
        : '未发现可关联的选项弹层';
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      trigger.blur(); return done(false);
    }
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); target.click();
    await new Promise((r) => setTimeout(r, 700));
    if (!f.el.isConnected) {
      const fresh = V2.discover().filter((x) => x.text === f.text && x.section?.domain === f.section?.domain);
      if (fresh.length !== 1) { f.failure = '选择后组件替换，无法唯一复查'; return done(false); }
      f.el = fresh[0].el;
    }
    const finalValue = V2.readValue(f);
    const ok = aliases.some((a) => norm(finalValue) === norm(a)) && (!searched || !visible(target) || target.getAttribute('aria-selected') === 'true');
    if (!ok) f.failure = '选择后显示值未保留';
    return done(ok);
  } };
  const editable = { id: 'contenteditable', supports: (f) => f.el.isContentEditable, async write(f, value) {
    f.el.textContent = String(value); f.el.dispatchEvent(new Event('input', { bubbles: true })); f.el.dispatchEvent(new Event('change', { bubbles: true }));
    return f.el.textContent === String(value);
  } };
  const pause = (ms = 120) => new Promise(resolve => setTimeout(resolve, ms));
  const phoenixDate = { id: 'phoenix-calendar', supports: f => !!f.el.closest('.phoenix-select') && /日期|时间|年月|birthday|date/.test(f.text), async write(f, value) {
    const parts = String(value).trim().match(/^(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2})日?)?月?$/);
    if (!parts) { f.failure = '日期必须包含明确的年和月'; return false; }
    const y = Number(parts[1]), m = Number(parts[2]), d = parts[3] === undefined ? undefined : Number(parts[3]);
    if (m < 1 || m > 12 || (d !== undefined && (!d || d > new Date(y,m,0).getDate()))) { f.failure = '档案日期无效'; return false; }
    const before = new Set(Array.from(document.querySelectorAll('.phoenix-calendar')).filter(visible));
    const click = async el => {
      if (!el || !visible(el) || el.closest('[aria-disabled=true],[disabled],[class*="disabled"]')) return false;
      el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true})); el.click(); await pause(); return true;
    };
    f.el.focus(); await click(f.el);
    let root;
    for (let i=0;i<15;i++) {
      const roots = Array.from(document.querySelectorAll('.phoenix-calendar')).filter(el => visible(el) && !before.has(el));
      if (roots.length === 1) { root = roots[0]; break; }
      await pause();
    }
    const fail = reason => { f.failure = reason; document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); document.body.click(); f.el.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); f.el.blur(); return false; };
    if (!root) return fail('未找到唯一关联的 Phoenix 日历');
    const get = suffix => Array.from(root.querySelectorAll('.phoenix-calendar' + suffix)).find(visible);
    const monthOnly = root.classList.contains('phoenix-calendar-month-calendar');
    if (!monthOnly && d === undefined) return fail('网页需要具体日期，档案只有年月，未擅自补日');
    if (!get('-month-panel')) {
      if (!await click(get('-month-select'))) return fail('未找到月份入口');
    }
    const yearText = () => Number(get('-month-panel-year-select-content')?.textContent.trim());
    if (yearText() !== y) {
      if (!await click(get('-month-panel-year-select'))) return fail('未找到年份入口');
      let yearCell;
      for (let i=0;i<25;i++) {
        const cells = Array.from(root.querySelectorAll('.phoenix-calendar-year-panel-year')).filter(visible);
        yearCell = cells.find(el => Number(el.textContent.trim()) === y);
        if (yearCell) break;
        const years = cells.map(el=>Number(el.textContent.trim())).filter(Number.isFinite);
        if (!years.length) break;
        const direction = y < Math.min(...years) ? 'prev' : 'next';
        if (!await click(get(`-year-panel-${direction}-decade-btn`))) break;
      }
      if (!yearCell || !await click(yearCell)) return fail('目标年份不存在或不可选择');
    }
    if (yearText() !== y) return fail('年份切换未生效');
    const months = Array.from(root.querySelectorAll('.phoenix-calendar-month-panel-month')).filter(visible);
    const month = months.filter(el => Number(el.textContent.trim().replace(/月$/, '')) === m);
    if (month.length !== 1 || !await click(month[0])) return fail('目标月份不可选择');
    if (!monthOnly) {
      const days = Array.from(root.querySelectorAll('.phoenix-calendar-date')).filter(el => visible(el) &&
        !el.closest('.phoenix-calendar-last-month-cell,.phoenix-calendar-next-month-btn-day') && Number(el.textContent.trim()) === d);
      if (days.length !== 1 || !await click(days[0])) return fail('目标日期不可选择');
    }
    await pause(700);
    const actual = V2.readValue(f).match(/^(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2}))?/);
    const ok = actual && +actual[1] === y && +actual[2] === m && (monthOnly || +actual[3] === d);
    return ok ? true : fail('日历选择后日期未保留');
  } };
  V2.adapters = [nativeSelect, phoenixDate, combo, editable, nativeText];
  V2.probeDateStructures = async () => {
    const results = [];
    // Do not dismiss a popup the user already has open.
    if (Array.from(document.querySelectorAll('.phoenix-calendar')).some(visible)) return [{status:'已有日历展开，未自动探测；请收起后重试'}];
    for (const field of V2.discover().filter(phoenixDate.supports).slice(0, 20)) {
      field.el.focus(); field.el.click(); await pause(200);
      const roots = Array.from(document.querySelectorAll('.phoenix-calendar')).filter(visible);
      const structures = roots.map(root => {
        const clone = root.cloneNode(true);
        clone.querySelectorAll('svg,script,style').forEach(node=>node.remove());
        for (const node of [clone,...clone.querySelectorAll('*')]) {
          for (const attr of Array.from(node.attributes)) if (!['class','role','aria-disabled','aria-selected','disabled'].includes(attr.name)) node.removeAttribute(attr.name);
          for (const child of Array.from(node.childNodes)) {
            if (child.nodeType === 8) child.remove();
            if (child.nodeType === 3 && !/^[\d\s年月日一二三四五六七八九十今本至x/.,:—-]*$/.test(child.textContent)) child.textContent = '[文]';
          }
        }
        return clone.outerHTML.slice(0,16000);
      });
      results.push({label:field.text,section:field.section?.domain || null,status:roots.length===1?'已采集弹层':'未展开或弹层不唯一',structures});
      document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
      document.body.click(); field.el.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); field.el.blur(); await pause();
      if (roots.some(visible)) { results.push({status:'弹层未关闭，停止探测，避免误关联'}); break; }
    }
    return results;
  };
  V2.readValue = (field) => {
    if (field.el.isContentEditable) return field.el.textContent.trim();
    const phoenix = field.el.closest('.phoenix-select');
    if (phoenix) {
      // The input may only contain an uncommitted search query.
      const display = phoenix.querySelector('.phoenix-select__tipEle')?.textContent?.trim() || '';
      return display === '请选择' ? '' : display;
    }
    const owner = field.el.closest(ownerSelector) || field.el;
    const value = field.el.value || owner.querySelector('.ant-select-selection-item,.el-select__selected-item,.ant-select-selection-placeholder')?.textContent?.trim() || '';
    return /^(请选择|please select|证件)$/i.test(value) ? '' : value;
  };
})();
