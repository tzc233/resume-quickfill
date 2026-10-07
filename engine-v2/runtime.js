(() => {
  const V2 = window.__RQF_V2_PARTS;
  window.__RQF_V2 = {
    version: V2.VERSION,
    async fill(profile, resumeFile) {
      if (V2.fillInFlight) return V2.fillInFlight;
      // 用户在这个站点点了填充,才对它启用手动填写的记忆(见 learning.js)
      if (V2.armLearning) await V2.armLearning(true);
      const task = this._fill(profile, resumeFile);
      V2.fillInFlight = task;
      try {
        return await task;
      } catch (e) {
        /* 进度条现在归 2.x 收尾 —— 一旦这里抛错而没人收,页面上会永远挂着
         * 一条「正在处理组合控件…」,比没有进度条更让人以为卡死。 */
        const ui = (window.__RQF && window.__RQF.ui) || { finish() {} };
        ui.finish(`⚠️ 填充出错:${String((e && e.message) || e).slice(0, 40)}`);
        throw e;
      } finally {
        V2.fillInFlight = null;
        V2.deferredLearning = null;
      }
    },
    async _fill(profile, resumeFile) {
      const handled = new Set(), filled = [], skipped = [];
      const receipts = [];
      // 下拉和日期会触发表单整体重渲染。先让兼容层完成这些高扰动操作，
      // 再由 2.x 写普通文本，避免 React 用旧状态把刚写入的内容清空。
      const ui = (window.__RQF && window.__RQF.ui) || { step() {}, finish() {} };
      V2.deferredLearning = new WeakSet();
      const initial = V2.discover(), initialHits = V2.resolveAll(initial);
      for (let i=0;i<initial.length;i++) {
        if (V2.isSelection(initial[i]) && !V2.readValue(initial[i]) && V2.learnedFor && await V2.learnedFor(initial[i], initialHits[i], initial)) V2.deferredLearning.add(initial[i].el);
      }
      /* keepProgress:1.x 跑完不收尾。它的 finish 会起一个 5 秒后销毁的定时器,
       * 而下面这一段(每个下拉 700ms 等待、逐层试触发)轻松超过 5 秒 ——
       * 进度条自己撤掉、页面却还在被点,用户判断不出什么时候能动手。 */
      const legacy = window.__RQF
        ? await window.__RQF.fill(profile, resumeFile, { keepProgress: true })
        : { filled: [], skipped: [], unmatched: [] };
      if (legacy.awardRouting === 'merged') profile = {...profile, awards: window.__RQF.mergeAwardEntries(profile.awards, profile.competitions)};
      await new Promise((resolve) => setTimeout(resolve, 180));
      const fields = V2.discover(), resolutions = V2.resolveAll(fields);
      for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) {
        let field = fields[fieldIndex];
        if (fieldIndex % 4 === 0) {
          ui.step(`正在处理组合控件 ${fieldIndex + 1}/${fields.length}…`,
            0.93 + 0.06 * (fieldIndex / Math.max(1, fields.length)));
        }
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
        const isSelection = V2.isSelection(field);
        const learned = isSelection && V2.learnedFor ? await V2.learnedFor(field, hit, fields.includes(field) ? fields : null) : null;
        // 填空记忆补充档案缺值；档案有值时始终优先。
        const learnedText = !isSelection && V2.learnedTextFor
          ? await V2.learnedTextFor(field, fields, hit) : null;
        if (!hit && !learned && !learnedText) continue;
        const fromProfile = hit ? V2.valueFor(profile, hit.spec) : null;
        const value = learned || (fromProfile == null || fromProfile === '' ? learnedText : fromProfile);
        if (value == null || value === '') continue;
        const adapter = V2.adapters.find((a) => a.supports(field)); if (!adapter) continue;
        if (V2.readValue(field)) continue; // storage lookup can yield while the user edits
        let ok = false;
        try { ok = await adapter.write(field, adapter.id === 'phoenix-calendar' && learned ? learned.text : value, hit?.spec || {}); }
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
        if (ok) { handled.add(field.el); const row = { label: field.text, value: shown, engine: 'v2', adapter: adapter.id, learned: !!(learned || learnedText) }; filled.push(row); receipts.push({field, row, expected: V2.readValue(field)}); }
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
      // 真正的收尾在这里 —— 两条流水线都干完了,进度条才撤
      const nf = result.filled.length + (legacy.fileFilled ? 1 : 0);
      const ns = result.skipped.length;
      ui.finish(nf
        ? `✅ 已填 ${nf} 项${ns ? ` · 跳过 ${ns} 项` : ''},请自行核对后提交`
        : '未填充任何字段 —— 点插件图标看原因');
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
