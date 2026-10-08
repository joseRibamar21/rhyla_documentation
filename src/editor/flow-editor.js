/* Editor de fluxos do Rhyla (roda só no `rhyla dev`). Sem dependências. */
(function () {
  const API = '/__rhyla/api';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const pageHref = (slug) => (slug === 'home' ? '/' : `/${slug}.html`);

  const ICON_X = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';

  // ===== Estado =====
  let flow = { slug: '', title: '', description: '', start: '', body: '', steps: [] };
  let isNew = true;
  let selected = null;     // id do passo selecionado
  let connecting = false;  // modo "clique no destino para conectar"
  let dirty = false;
  let pages = [];
  let warnings = [];
  let zoom = 1;
  const past = [];
  const future = [];

  const stepById = (id) => flow.steps.find((s) => s.id === id);
  const pageBySlug = (slug) => pages.find((p) => p.slug === slug);
  const snapshot = () => JSON.stringify({ flow, selected });

  function setDirty(v) {
    dirty = v;
    $('fe-dirty').hidden = !v;
  }

  /** Mudança estrutural: guarda o estado anterior (desfazer), aplica, redesenha. */
  function mutate(fn, { panel = true } = {}) {
    past.push(snapshot());
    if (past.length > 200) past.shift();
    future.length = 0;
    fn();
    setDirty(true);
    if (panel) renderPanel();
    renderCanvas();
    updateHistoryButtons();
  }

  // Campos de texto: um ponto de desfazer por edição (no foco), não por tecla
  let editing = false;
  function beginEdit() { if (!editing) { past.push(snapshot()); future.length = 0; editing = true; updateHistoryButtons(); } }
  function endEdit() { editing = false; }

  function restore(json) {
    const s = JSON.parse(json);
    flow = s.flow;
    selected = s.selected && stepById(s.selected) ? s.selected : null;
    setDirty(true);
    renderPanel();
    renderCanvas();
    updateHistoryButtons();
  }
  function undo() { if (past.length) { future.push(snapshot()); restore(past.pop()); } }
  function redo() { if (future.length) { past.push(snapshot()); restore(future.pop()); } }
  function updateHistoryButtons() { $('fe-undo').disabled = !past.length; $('fe-redo').disabled = !future.length; }

  function uniqueId(base) {
    const clean = String(base || 'step').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'step';
    let id = clean;
    let i = 2;
    while (stepById(id)) id = `${clean}-${i++}`;
    return id;
  }

  // ===== Toast =====
  let toastTimer;
  function toast(msg, isError) {
    const el = $('fe-toast');
    el.textContent = msg;
    el.classList.toggle('error', Boolean(isError));
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), isError ? 4000 : 1800);
  }

  // ===== Canvas =====
  let previewTimer;
  let previewSeq = 0;
  function renderCanvas() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(fetchPreview, 60);
  }

  async function fetchPreview() {
    $('fe-empty').hidden = flow.steps.length > 0;
    if (!flow.steps.length) {
      $('fe-stage').innerHTML = '';
      warnings = [];
      renderChecks();
      return;
    }
    const seq = ++previewSeq;
    try {
      const res = await fetch(`${API}/flow/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: flow.slug, title: flow.title, start: flow.start, steps: flow.steps }),
      });
      const data = await res.json();
      if (seq !== previewSeq) return; // resposta antiga
      $('fe-stage').innerHTML = data.svg || '';
      warnings = data.warnings || [];
      decorateCanvas();
      renderChecks();
    } catch (e) {
      toast('Preview failed: is `rhyla dev` running?', true);
    }
  }

  function decorateCanvas() {
    const start = flow.start || (flow.steps[0] && flow.steps[0].id);
    $('fe-stage').querySelectorAll('[data-step]').forEach((node) => {
      const id = node.getAttribute('data-step');
      node.classList.toggle('is-selected', id === selected);
      node.classList.toggle('is-start', id === start);
      node.setAttribute('tabindex', '0');
      node.setAttribute('role', 'button');
    });
    applyZoom();
  }

  function applyZoom() {
    $('fe-stage').style.transform = `scale(${zoom})`;
    $('fe-zoom-level').textContent = `${Math.round(zoom * 100)}%`;
  }
  function setZoom(z) { zoom = Math.min(2, Math.max(0.3, Math.round(z * 100) / 100)); applyZoom(); }
  function fitZoom() {
    const svg = $('fe-stage').querySelector('svg');
    if (!svg) return setZoom(1);
    const canvas = $('fe-canvas');
    const w = Number(svg.getAttribute('width')) + 96;
    const h = Number(svg.getAttribute('height')) + 168;
    setZoom(Math.min(1, canvas.clientWidth / w, canvas.clientHeight / h));
  }

  function setConnecting(on) {
    connecting = Boolean(on && selected);
    document.body.classList.toggle('fe-connecting', connecting);
    $('fe-hint').textContent = connecting ? 'Click the step to connect to · Esc to cancel' : '';
    const btn = document.querySelector('[data-action="connect"]');
    if (btn) btn.classList.toggle('is-active', connecting);
  }

  function select(id) {
    selected = id && stepById(id) ? id : null;
    setConnecting(false);
    renderPanel();
    decorateCanvas();
  }

  function connect(fromId, toId) {
    const from = stepById(fromId);
    if (!from || fromId === toId && !confirm('Connect this step to itself?')) return;
    if (from.next.some((n) => n.to === toId)) { toast('Already connected'); return; }
    mutate(() => { from.next.push({ to: toId, label: '' }); });
    toast(`Connected → ${stepTitle(stepById(toId))}`);
  }

  $('fe-stage').addEventListener('click', (e) => {
    e.preventDefault(); // os nós são links para as páginas
    const node = e.target.closest('[data-step]');
    if (!node) { if (!connecting) select(null); return; }
    const id = node.getAttribute('data-step');
    if (connecting && selected) { const from = selected; setConnecting(false); connect(from, id); return; }
    select(id);
  });
  $('fe-stage').addEventListener('dblclick', (e) => {
    const node = e.target.closest('[data-step]');
    const step = node && stepById(node.getAttribute('data-step'));
    if (step && step.page) window.open(pageHref(step.page), '_blank');
  });
  $('fe-canvas').addEventListener('click', (e) => { if (e.target === $('fe-canvas') && !connecting) select(null); });

  // ===== Painel =====
  function stepTitle(step) {
    if (!step) return '';
    if (step.title) return step.title;
    const p = step.page && pageBySlug(step.page);
    return p ? p.title : step.page || step.id;
  }

  function renderPanel() {
    $('fe-name').textContent = flow.title || 'Untitled flow';
    const open = $('fe-open');
    open.hidden = isNew;
    open.href = pageHref(flow.slug);
    $('fe-back').href = isNew ? '/' : pageHref(flow.slug);
    $('fe-panel').innerHTML = selected ? stepPanel(stepById(selected)) : flowPanel();
    bindPanel();
    renderChecks();
  }

  function flowPanel() {
    const start = flow.start || (flow.steps[0] && flow.steps[0].id) || '';
    const steps = flow.steps.map((s) => `
      <li data-select="${esc(s.id)}">
        <span class="fe-step-kind${s.page ? '' : ' is-text'}"></span>
        <span>${esc(stepTitle(s))}</span>
        ${s.id === start ? '<span class="fe-step-start">START</span>' : ''}
      </li>`).join('');
    return `
      <section class="fe-section">
        <h2>Flow</h2>
        <label class="fe-field"><span>Title</span>
          <input class="fe-input" data-flow="title" value="${esc(flow.title)}" placeholder="Checkout"></label>
        <label class="fe-field"><span>Description</span>
          <input class="fe-input" data-flow="description" value="${esc(flow.description)}" placeholder="One line about this flow"></label>
        <label class="fe-field"><span>File</span>
          <input class="fe-input mono" data-flow="slug" value="${esc(flow.slug)}" ${isNew ? '' : 'readonly'} spellcheck="false">
          <small>${isNew ? 'Path inside rhyla-docs/body, without extension.' : `rhyla-docs/body/${esc(flow.slug)}.md`}</small></label>
        <label class="fe-field"><span>Start step</span>
          <select class="fe-select" data-flow="start">${flow.steps.map((s) => `<option value="${esc(s.id)}"${s.id === start ? ' selected' : ''}>${esc(stepTitle(s))}</option>`).join('') || '<option value="">—</option>'}</select></label>
      </section>
      <section class="fe-section">
        <div class="fe-section-head"><h2>Steps (${flow.steps.length})</h2></div>
        ${steps ? `<ul class="fe-steps">${steps}</ul>` : '<p class="fe-muted">No steps yet. Use “Page step” or “Decision” on the canvas.</p>'}
      </section>
      <section class="fe-section">
        <h2>Checks</h2>
        <div id="fe-checks"></div>
      </section>
      <section class="fe-section">
        <h2>Page text</h2>
        <label class="fe-field">
          <textarea class="fe-textarea" data-flow="body" placeholder="Markdown shown below the diagram">${esc(flow.body)}</textarea></label>
      </section>
      <section class="fe-section">
        <h2>Shortcuts</h2>
        <div class="fe-kbd-list">
          <kbd class="rh-kbd">C</kbd><span>connect the selected step</span>
          <kbd class="rh-kbd">N</kbd><span>add a page step after the selected one</span>
          <kbd class="rh-kbd">Del</kbd><span>delete the selected step</span>
          <kbd class="rh-kbd">Ctrl Z</kbd><span>undo</span>
          <kbd class="rh-kbd">Ctrl S</kbd><span>save</span>
          <span>2× click</span><span>open the step's page</span>
        </div>
      </section>`;
  }

  function stepPanel(step) {
    const page = step.page ? pageBySlug(step.page) : null;
    const others = flow.steps.filter((s) => s.id !== step.id);
    const conns = step.next.map((n, i) => `
      <div class="fe-conn">
        <select class="fe-select" data-next-to="${i}">${flow.steps.map((s) => `<option value="${esc(s.id)}"${s.id === n.to ? ' selected' : ''}>${esc(stepTitle(s))}</option>`).join('')}</select>
        <input class="fe-input" data-next-label="${i}" value="${esc(n.label)}" placeholder="label">
        <button class="fe-icon-btn" data-next-remove="${i}" aria-label="Remove connection">${ICON_X}</button>
      </div>`).join('');
    const isStart = (flow.start || (flow.steps[0] && flow.steps[0].id)) === step.id;
    return `
      <section class="fe-section">
        <div class="fe-section-head">
          <h2>Step</h2>
          <button class="fe-btn fe-btn--small" data-action="deselect">← Flow</button>
        </div>
        <div class="fe-segment" role="tablist">
          <button data-kind="page" class="${step.page || step._kind === 'page' ? 'is-active' : ''}">Page</button>
          <button data-kind="text" class="${!step.page && step._kind !== 'page' ? 'is-active' : ''}">Decision / text</button>
        </div>
        ${step.page || step._kind === 'page' ? `
          <div class="fe-field"><span>Page</span>
            <button class="fe-page-pick${page ? '' : ' is-empty'}" data-action="pick-page">
              <span class="fe-page-title">${page ? esc(page.title) : step.page ? 'Missing page' : 'Choose a page…'}</span>
              ${step.page ? `<span class="fe-page-slug">${esc(step.page)}</span>` : ''}
            </button>
          </div>` : ''}
        <label class="fe-field"><span>Title</span>
          <input class="fe-input" data-step-field="title" value="${esc(step.title)}" placeholder="${esc(page ? page.title : 'What happens here?')}"></label>
        <label class="fe-field"><span>Note</span>
          <input class="fe-input" data-step-field="note" value="${esc(step.note)}" placeholder="${esc(page && page.description ? page.description : 'Short subtitle')}"></label>
        <label class="fe-field"><span>Id</span>
          <input class="fe-input mono" data-step-id value="${esc(step.id)}" spellcheck="false">
          <small>Used by connections. Renaming updates them.</small></label>
      </section>
      <section class="fe-section">
        <div class="fe-section-head">
          <h2>Next</h2>
          <button class="fe-btn fe-btn--small" data-action="connect" title="Then click a step on the canvas (C)">Connect on canvas</button>
        </div>
        ${conns || '<p class="fe-muted">End of the flow. Add a connection to continue.</p>'}
        <div class="fe-row" style="margin-top:8px">
          ${others.length ? `<select class="fe-select" data-add-next style="flex:1"><option value="">Connect to…</option>${others.map((s) => `<option value="${esc(s.id)}">${esc(stepTitle(s))}</option>`).join('')}</select>` : ''}
        </div>
        <div class="fe-row" style="margin-top:10px">
          <button class="fe-btn" data-action="add-after">+ Page step after</button>
          <button class="fe-btn" data-action="add-text-after">+ Decision after</button>
        </div>
      </section>
      <section class="fe-section">
        <div class="fe-row">
          ${isStart ? '<span class="fe-muted" style="margin:0;align-self:center">This is the start step</span>' : '<button class="fe-btn" data-action="set-start">Set as start</button>'}
          ${step.page && page ? `<a class="fe-btn" href="${esc(pageHref(step.page))}" target="_blank">Open page ↗</a>` : ''}
          <button class="fe-btn fe-btn--danger" data-action="delete" style="margin-left:auto">Delete step</button>
        </div>
      </section>`;
  }

  function renderChecks() {
    const el = $('fe-checks');
    if (!el) return;
    const notes = [];
    const edges = flow.steps.reduce((n, s) => n + s.next.length, 0);
    if (flow.steps.length > 1 && !edges) notes.push('No connections yet: the published flow will link the steps in list order.');
    const all = warnings.concat(notes);
    el.innerHTML = all.length
      ? `<ul class="fe-warnings">${all.map((w) => `<li>${esc(w.replace(/^flow "[^"]*": /, ''))}</li>`).join('')}</ul>`
      : '<div class="fe-ok">✓ No problems found</div>';
  }

  function bindPanel() {
    const panel = $('fe-panel');

    panel.querySelectorAll('[data-flow]').forEach((input) => {
      const key = input.getAttribute('data-flow');
      input.addEventListener('focus', beginEdit);
      input.addEventListener('blur', endEdit);
      input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
        if (input.tagName === 'SELECT') beginEdit();
        flow[key] = input.value;
        if (key === 'slug') flow.slug = input.value.trim().replace(/^\/+|\/+$/g, '').replace(/\.md$/i, '');
        setDirty(true);
        if (key === 'title') $('fe-name').textContent = flow.title || 'Untitled flow';
        if (key === 'start' || key === 'title') renderCanvas();
        if (key === 'start') { endEdit(); renderPanel(); }
      });
    });

    panel.querySelectorAll('[data-select]').forEach((li) => li.addEventListener('click', () => select(li.getAttribute('data-select'))));

    const step = selected && stepById(selected);
    if (!step) return;

    panel.querySelectorAll('[data-step-field]').forEach((input) => {
      const key = input.getAttribute('data-step-field');
      input.addEventListener('focus', beginEdit);
      input.addEventListener('blur', () => { endEdit(); renderPanel(); });
      input.addEventListener('input', () => { step[key] = input.value; setDirty(true); renderCanvas(); });
    });

    const idInput = panel.querySelector('[data-step-id]');
    idInput.addEventListener('change', () => {
      const next = uniqueId(idInput.value);
      if (!idInput.value.trim() || next === step.id) { idInput.value = step.id; return; }
      const old = step.id;
      mutate(() => {
        step.id = next;
        flow.steps.forEach((s) => s.next.forEach((n) => { if (n.to === old) n.to = next; }));
        if (flow.start === old) flow.start = next;
        selected = next;
      });
    });

    panel.querySelectorAll('[data-kind]').forEach((btn) => btn.addEventListener('click', () => {
      const kind = btn.getAttribute('data-kind');
      if (kind === 'page') { mutate(() => { step._kind = 'page'; }); openPicker('assign'); }
      else mutate(() => { delete step._kind; if (step.page && !step.title) step.title = stepTitle(step); step.page = ''; });
    }));

    panel.querySelectorAll('[data-next-to]').forEach((sel) => sel.addEventListener('change', () => {
      mutate(() => { step.next[Number(sel.getAttribute('data-next-to'))].to = sel.value; });
    }));
    panel.querySelectorAll('[data-next-label]').forEach((input) => {
      input.addEventListener('focus', beginEdit);
      input.addEventListener('blur', endEdit);
      input.addEventListener('input', () => { step.next[Number(input.getAttribute('data-next-label'))].label = input.value; setDirty(true); renderCanvas(); });
    });
    panel.querySelectorAll('[data-next-remove]').forEach((btn) => btn.addEventListener('click', () => {
      mutate(() => { step.next.splice(Number(btn.getAttribute('data-next-remove')), 1); });
    }));
    const addNext = panel.querySelector('[data-add-next]');
    if (addNext) addNext.addEventListener('change', () => { if (addNext.value) connect(step.id, addNext.value); });

    panel.querySelectorAll('[data-action]').forEach((btn) => btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      if (action === 'deselect') select(null);
      else if (action === 'pick-page') openPicker('assign');
      else if (action === 'connect') setConnecting(!connecting);
      else if (action === 'add-after') openPicker('add');
      else if (action === 'add-text-after') addTextStep();
      else if (action === 'set-start') mutate(() => { flow.start = step.id; });
      else if (action === 'delete') deleteStep(step.id);
    }));
  }

  // ===== Ações =====
  function addStep(step) {
    const from = selected && stepById(selected);
    mutate(() => {
      flow.steps.push(step);
      // Com um passo selecionado, o novo passo vem logo depois dele
      if (from) from.next.push({ to: step.id, label: '' });
      selected = step.id;
    });
  }

  function addPageStep(slug) {
    const page = pageBySlug(slug);
    addStep({ id: uniqueId(slug.split('/').pop()), page: slug, title: '', note: '', next: [] });
    toast(`Added “${page ? page.title : slug}”`);
  }

  function addTextStep() {
    addStep({ id: uniqueId('decision'), page: '', title: 'New decision', note: '', next: [] });
    setTimeout(() => { const t = document.querySelector('[data-step-field="title"]'); if (t) { t.focus(); t.select(); } }, 0);
  }

  function deleteStep(id) {
    const step = stepById(id);
    if (!step) return;
    mutate(() => {
      flow.steps = flow.steps.filter((s) => s.id !== id);
      flow.steps.forEach((s) => { s.next = s.next.filter((n) => n.to !== id); });
      if (flow.start === id) flow.start = '';
      selected = null;
    });
    toast(`Deleted “${stepTitle(step)}”`);
  }

  // ===== Seletor de páginas =====
  let pickerMode = 'add';
  let pickerItems = [];
  let pickerIndex = 0;

  function openPicker(mode) {
    pickerMode = mode;
    $('fe-picker').hidden = false;
    $('fe-picker-input').value = '';
    $('fe-picker-new-path').value = '';
    renderPicker('');
    $('fe-picker-input').focus();
  }
  function closePicker() { $('fe-picker').hidden = true; $('fe-canvas').focus(); }

  function renderPicker(query) {
    const q = fold(query.trim());
    const used = new Set(flow.steps.map((s) => s.page).filter(Boolean));
    pickerItems = pages
      .filter((p) => p.type !== 'flow' && p.slug !== flow.slug)
      .filter((p) => !q || fold(p.title).includes(q) || fold(p.slug).includes(q))
      .slice(0, 50);
    pickerIndex = 0;
    $('fe-picker-list').innerHTML = pickerItems.length
      ? pickerItems.map((p, i) => `<div class="fe-picker-item${i === 0 ? ' is-active' : ''}${used.has(p.slug) ? ' is-used' : ''}" data-i="${i}" role="option"><strong>${esc(p.title)}</strong><span>${esc(p.slug)}</span></div>`).join('')
      : '<div class="fe-picker-empty">No pages found. Create one below.</div>';
    if (q && !pickerItems.length) $('fe-picker-new-path').value = q.replace(/\s+/g, '_');
  }

  function choosePage(slug) {
    closePicker();
    if (pickerMode === 'assign' && selected) {
      const step = stepById(selected);
      mutate(() => { step.page = slug; delete step._kind; });
    } else {
      addPageStep(slug);
    }
  }

  function movePicker(delta) {
    const items = $('fe-picker-list').querySelectorAll('.fe-picker-item');
    if (!items.length) return;
    pickerIndex = (pickerIndex + delta + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle('is-active', i === pickerIndex));
    items[pickerIndex].scrollIntoView({ block: 'nearest' });
  }

  $('fe-picker-input').addEventListener('input', (e) => renderPicker(e.target.value));
  $('fe-picker-input').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); movePicker(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); movePicker(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (pickerItems[pickerIndex]) choosePage(pickerItems[pickerIndex].slug); }
    else if (e.key === 'Escape') { e.preventDefault(); closePicker(); }
  });
  $('fe-picker-list').addEventListener('click', (e) => {
    const item = e.target.closest('[data-i]');
    if (item) choosePage(pickerItems[Number(item.getAttribute('data-i'))].slug);
  });
  $('fe-picker').addEventListener('click', (e) => { if (e.target.hasAttribute('data-close-picker')) closePicker(); });
  $('fe-picker-create').addEventListener('click', createPage);
  $('fe-picker-new-path').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); createPage(); } if (e.key === 'Escape') closePicker(); });

  async function createPage() {
    const slug = $('fe-picker-new-path').value.trim().replace(/^\/+|\/+$/g, '').replace(/\.md$/i, '');
    if (!slug) { $('fe-picker-new-path').focus(); return; }
    const res = await fetch(`${API}/page`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug }) });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Could not create the page', true); return; }
    await loadPages();
    toast(`Created ${data.slug}.md`);
    choosePage(data.slug);
  }

  // ===== Salvar / carregar =====
  async function save() {
    if (!flow.title.trim()) { toast('Give the flow a title first', true); select(null); return; }
    if (!flow.slug) { toast('Choose a file path first', true); select(null); return; }
    const steps = flow.steps.map(({ _kind, ...s }) => s);
    const res = await fetch(`${API}/flow`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...flow, steps }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || 'Save failed', true); return; }
    isNew = false;
    flow.slug = data.slug;
    setDirty(false);
    history.replaceState(null, '', `?flow=${encodeURIComponent(flow.slug)}`);
    await loadPages();
    renderPanel();
    toast('Saved');
  }

  async function loadPages() {
    const res = await fetch(`${API}/pages`);
    pages = (await res.json()).pages || [];
  }

  async function init() {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    document.querySelectorAll('[data-shortcut-save]').forEach((k) => { k.textContent = isMac ? '⌘ S' : 'Ctrl S'; });
    await loadPages();

    const slug = new URLSearchParams(location.search).get('flow');
    if (slug) {
      const res = await fetch(`${API}/flow?slug=${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (res.ok) {
        flow = { slug: data.slug, title: data.title, description: data.description, start: data.start, body: data.body, steps: data.steps };
        isNew = false;
        // Sem nenhuma conexão, o site liga os passos em ordem: deixa isso explícito no editor
        if (flow.steps.length > 1 && flow.steps.every((s) => !s.next.length)) {
          flow.steps.forEach((s, i) => { if (flow.steps[i + 1]) s.next = [{ to: flow.steps[i + 1].id, label: '' }]; });
        }
      } else {
        toast(data.error || 'Flow not found', true);
      }
    }
    if (isNew) {
      let base = 'flows/new_flow';
      let i = 2;
      while (pageBySlug(base)) base = `flows/new_flow_${i++}`;
      flow = { slug: base, title: 'New flow', description: '', start: '', body: '', steps: [] };
    }
    renderPanel();
    renderCanvas();
    updateHistoryButtons();
    setTimeout(fitZoom, 150);
  }

  // ===== Barra superior e atalhos =====
  $('fe-save').addEventListener('click', save);
  $('fe-undo').addEventListener('click', undo);
  $('fe-redo').addEventListener('click', redo);
  $('fe-add-page').addEventListener('click', () => openPicker('add'));
  $('fe-add-text').addEventListener('click', addTextStep);
  $('fe-zoom-in').addEventListener('click', () => setZoom(zoom + 0.1));
  $('fe-zoom-out').addEventListener('click', () => setZoom(zoom - 0.1));
  $('fe-zoom-fit').addEventListener('click', fitZoom);
  $('fe-new').addEventListener('click', (e) => { if (dirty && !confirm('Discard unsaved changes?')) e.preventDefault(); });

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const typing = /^(input|textarea|select)$/i.test(e.target.tagName);
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
    if (!$('fe-picker').hidden) return;
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
    if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === 'Escape') { connecting ? setConnecting(false) : select(null); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); deleteStep(selected); }
    else if (e.key.toLowerCase() === 'c' && selected && !mod) { e.preventDefault(); setConnecting(!connecting); }
    else if (e.key.toLowerCase() === 'n' && !mod) { e.preventDefault(); openPicker('add'); }
    else if (e.key === 'Enter' && document.activeElement && document.activeElement.hasAttribute('data-step')) select(document.activeElement.getAttribute('data-step'));
  });

  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  init();
})();
