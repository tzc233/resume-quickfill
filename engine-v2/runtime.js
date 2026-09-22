(() => {
  const V2 = window.__RQF_V2_PARTS;
  window.__RQF_V2 = {
    version: V2.VERSION,
    async fill(profile, resumeFile) {
      const handled = new Set(), filled = [], skipped = [];
      const receipts = [];
      // 下拉和日期会触发表单整体重渲染。先让兼容层完成这些高扰动操作，
      // 再由 2.x 写普通文本，避免 React 用旧状态把刚写入的内容清空。
      const legacy = window.__RQF ? await window.__RQF.fill(profile, resumeFile) : { filled: [], skipped: [], unmatched: [] };
      if (legacy.awardRouting === 'merged') profile = {...profile, awards: window.__RQF.mergeAwardEntries(profile.awards, profile.competitions)};
      await new Promise((resolve) => setTimeout(resolve, 180));
      const fields = V2.discover(), resolutions = V2.resolveAll(fields);
      for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) {
        let field = fields[fieldIndex];
        const relocate = () => {
          if (field.el.isConnected) return field;
          const fresh = V2.discover();
          const matches = fresh.filter((f) => field.el.id ? f.el.id === field.el.id
            : field.el.name ? f.el.name === field.el.name
            : field.pathHint ? f.pathHint === field.pathHint : f.text === field.text);
          return matches.length === 1 ? matches[0] : null;
        };
        field = relocate();
        if (!field) { skipped.push({ label: fields[fieldIndex].text, reason: '页面重渲染后无法唯一定位字段', engine: 'v2' }); continue; }
        if (V2.readValue(field)) continue;
        const hit = resolutions[fieldIndex];
        const isSelection = field.tag === 'select' || field.role === 'combobox' || !!field.el.closest('.ant-select,.el-select,.aui-select');
        const learned = isSelection && V2.learnedFor ? await V2.learnedFor(field, hit) : null;
        if (!hit && !learned) continue;
        const value = learned || V2.valueFor(profile, hit.spec); if (value == null || value === '') continue;
        const adapter = V2.adapters.find((a) => a.supports(field)); if (!adapter) continue;
        let ok = false;
        try { ok = await adapter.write(field, value, hit?.spec || {}); }
        catch { field.failure = '控件操作异常，已继续其他字段'; }
        if (adapter.id === 'native-text' || adapter.id === 'native-select') {
          const expected = String(field.el.value);
          await new Promise((resolve) => setTimeout(resolve, 700));
          const current = relocate();
          ok = ok && !!current && String(current.el.value) === expected && expected !== '';
          if (!ok && current && !current.el.value) {
            field = current;
            ok = await adapter.write(field, value, hit?.spec || {});
            await new Promise((resolve) => setTimeout(resolve, 700));
            const final = relocate();
            ok = ok && !!final && String(final.el.value) === expected && expected !== '';
          }
        }
        const shown = learned ? learned.text : String(value);
        if (ok) { handled.add(field.el); const row = { label: field.text, value: shown, engine: 'v2', adapter: adapter.id, learned: !!learned }; filled.push(row); receipts.push({field, row, expected: V2.readValue(field)}); }
        else skipped.push({ label: field.text, reason: field.failure || `${adapter.id} 写入后校验失败`, engine: 'v2' });
      }
      await new Promise((resolve) => setTimeout(resolve, 700));
      const finalFields = V2.discover();
      for (const {field, row, expected} of receipts) {
        const matches = finalFields.filter((f) => f.el === field.el || (field.el.id ? f.el.id === field.el.id : field.el.name ? f.el.name === field.el.name : f.text === field.text && f.section?.domain === field.section?.domain));
        const current = matches.find(f => f.el === field.el) || (matches.length === 1 ? matches[0] : null);
        if (!current || !expected || V2.readValue(current) !== expected) {
          filled.splice(filled.indexOf(row), 1); handled.delete(field.el);
          skipped.push({label: row.label, reason: '整页复查时内容改变或字段无法定位', engine: 'v2'});
        }
      }
      const dedupe = (rows) => [...new Map(rows.map((x) => [`${x.label}\0${x.value || x.reason || ''}`, x])).values()];
      const result = { ...legacy, version: V2.VERSION, filled: dedupe([...filled, ...(legacy.filled || [])]), skipped: dedupe([...skipped, ...(legacy.skipped || [])]), v2: { handled: handled.size, filled, skipped } };
      window.__RQF_V2_LAST = { url: location.href, filled: filled.map((x) => ({ label: x.label, adapter: x.adapter })), skipped };
      return result;
    },
    async deepDiagnose(profile) {
      const beforeInventory = V2.inventory();
      const expandedForDiagnosis = await V2.expandEmptySections();
      const inventory = V2.inventory();
      inventory.datePopups = V2.probeDateStructures ? await V2.probeDateStructures() : [];
      const discovered = V2.discover(), resolved = V2.resolveAll(discovered);
      inventory.fieldAudit = discovered.map((field, i) => {
        const hit = resolved[i], adapter = V2.adapters.find((a) => a.supports(field));
        const available = hit && V2.valueFor(profile, hit.spec);
        return { label: field.text, key: hit?.spec.key || null, adapter: adapter?.id || null,
          status: V2.readValue(field) ? '页面已有值，未证明已保存' : !hit ? '未识别字段' : !adapter ? '没有控件适配器' : available == null || available === '' ? '档案缺值' : '可尝试填写' };
      });
      const learning = V2.learningInfo ? await V2.learningInfo() : null;
      const report = window.__RQF ? await window.__RQF.deepDiagnose(profile) : { rows: [], sections: [], redactions: [] };
      return { ...report, version: V2.VERSION, architecture: 'semantic-pipeline-v2', v2Last: window.__RQF_V2_LAST || null,
        v2Inventory: { ...inventory, beforeTotal: beforeInventory.total, expandedForDiagnosis }, v2Learning: learning };
    },
  };
})();
