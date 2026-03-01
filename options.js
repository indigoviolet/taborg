// Options page script for Tab Organizer extension

document.addEventListener('DOMContentLoaded', function () {

  // === TAB SWITCHING ===
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
    });
  });

  // === DECLUTTER PATTERNS ===

  const patternsList    = document.getElementById('patternsList');
  const newPatternInput = document.getElementById('newPattern');
  const newLabelInput   = document.getElementById('newLabel');
  const addPatternBtn   = document.getElementById('addPatternBtn');
  const suggestBtn      = document.getElementById('suggestBtn');
  const suggestNote     = document.getElementById('suggestNote');
  const suggestStatus   = document.getElementById('suggestStatus');
  const resetPatternsBtn = document.getElementById('resetPatternsBtn');
  const declutterStatus = document.getElementById('declutterStatus');

  const DEFAULT_PATTERNS = [
    { pattern: 'github.com/*/pull/*',     label: 'GitHub PR (reopenable)' },
    { pattern: 'github.com/*/issues/*',   label: 'GitHub Issue (reopenable)' },
    { pattern: 'app.slack.com/*',         label: 'Slack (reopenable)' },
    { pattern: 'mail.google.com/mail/*',  label: 'Gmail thread (reopenable)' }
  ];

  let sourceUrl = '';  // set from pendingPattern for AI suggestion

  async function loadPatterns() {
    const result = await chrome.storage.local.get('declutterPatterns');
    renderPatterns(result.declutterPatterns || DEFAULT_PATTERNS);
  }

  function renderPatterns(patterns) {
    if (patterns.length === 0) {
      patternsList.innerHTML = '<div class="patterns-empty">No patterns configured.</div>';
      return;
    }

    patternsList.innerHTML = patterns.map((p, i) => `
      <div class="pattern-item" data-index="${i}">
        <div class="pattern-info">
          <div class="pattern-glob" data-field="pattern" data-index="${i}" title="Click to edit">${escapeHtml(p.pattern)}</div>
          <div class="pattern-label" data-field="label"  data-index="${i}" title="Click to edit">${escapeHtml(p.label)}</div>
        </div>
        <button class="btn-remove" data-index="${i}" title="Remove">✕</button>
      </div>
    `).join('');

    // Inline editing — click on glob or label text to edit
    patternsList.querySelectorAll('[data-field]').forEach(el => {
      el.style.cursor = 'text';
      el.addEventListener('click', () => startInlineEdit(el, patterns));
    });

    // Remove buttons
    patternsList.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.index);
        const res = await chrome.storage.local.get('declutterPatterns');
        const current = res.declutterPatterns || DEFAULT_PATTERNS;
        current.splice(idx, 1);
        await chrome.storage.local.set({ declutterPatterns: current });
        renderPatterns(current);
        showStatus(declutterStatus, 'Pattern removed', 'success');
      });
    });
  }

  function startInlineEdit(el, patterns) {
    if (el.querySelector('input')) return; // already editing

    const idx   = parseInt(el.dataset.index);
    const field = el.dataset.field;
    const current = el.textContent;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = current;
    input.style.cssText = 'width:100%;padding:2px 4px;font-size:inherit;font-family:inherit;border:1px solid #2563eb;border-radius:3px;box-sizing:border-box;background:white;';
    el.textContent = '';
    el.appendChild(input);
    input.focus();
    input.select();

    async function commit() {
      const val = input.value.trim() || current;
      const res = await chrome.storage.local.get('declutterPatterns');
      const all = res.declutterPatterns || DEFAULT_PATTERNS;
      if (all[idx]) {
        all[idx][field] = val;
        await chrome.storage.local.set({ declutterPatterns: all });
      }
      renderPatterns(all);
    }

    input.addEventListener('blur',  commit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { input.blur(); }
      if (e.key === 'Escape') { el.textContent = current; }
    });
  }

  addPatternBtn.addEventListener('click', async () => {
    const pattern = newPatternInput.value.trim();
    const label   = newLabelInput.value.trim();
    if (!pattern) { showStatus(declutterStatus, 'Please enter a URL pattern', 'error'); return; }
    if (!label)   { showStatus(declutterStatus, 'Please enter a reason label', 'error'); return; }

    const res = await chrome.storage.local.get('declutterPatterns');
    const current = res.declutterPatterns || DEFAULT_PATTERNS;
    current.push({ pattern, label });
    await chrome.storage.local.set({ declutterPatterns: current });
    newPatternInput.value = '';
    newLabelInput.value   = '';
    sourceUrl = '';
    renderPatterns(current);
    showStatus(declutterStatus, 'Pattern added', 'success');
  });

  resetPatternsBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({ declutterPatterns: DEFAULT_PATTERNS });
    renderPatterns(DEFAULT_PATTERNS);
    showStatus(declutterStatus, 'Patterns reset to defaults', 'success');
  });

  // === AI SUGGEST ===

  suggestBtn.addEventListener('click', async () => {
    const { aiApiKey, aiModel, aiPromptTemplate } = await chrome.storage.local.get(['aiApiKey', 'aiModel', 'aiPromptTemplate']);

    if (!aiApiKey) {
      showStatus(suggestStatus, 'Add your API key on the AI tab first', 'error');
      return;
    }

    const url   = sourceUrl || newPatternInput.value.trim();
    const title = newLabelInput.value.trim(); // may be empty
    if (!url) {
      showStatus(suggestStatus, 'Enter a URL or pattern to suggest from', 'error');
      return;
    }

    suggestBtn.disabled = true;
    suggestBtn.textContent = 'Thinking…';
    showStatus(suggestStatus, '<span class="spinner"></span>Asking AI…', 'info');

    try {
      const prompt = buildPrompt(aiPromptTemplate || DEFAULT_PROMPT, url, title);
      const model  = aiModel || 'claude-haiku-4-5-20251001';
      const response = await chrome.runtime.sendMessage({
        action: 'suggestPattern', apiKey: aiApiKey, model, prompt
      }).catch(err => { throw new Error(err.message || 'Extension messaging failed'); });
      if (!response) throw new Error('No response from background — try again');
      if (!response.success) throw new Error(response.error);
      const { pattern, label } = response.result;
      newPatternInput.value = pattern || '';
      newLabelInput.value   = label   || '';
      showStatus(suggestStatus, 'Suggestion applied — review and click Add', 'success');
    } catch (err) {
      showStatus(suggestStatus, `AI error: ${err.message}`, 'error');
    } finally {
      suggestBtn.disabled    = false;
      suggestBtn.textContent = 'Suggest with AI';
    }
  });

  function buildPrompt(template, url, title) {
    return template.replace(/\{url\}/g, url).replace(/\{title\}/g, title);
  }

  // Check for a pending pattern coming from the right-click context menu
  async function checkPendingPattern() {
    const result = await chrome.storage.local.get('pendingPattern');
    if (!result.pendingPattern) return;

    const { pattern, sourceUrl: su, title } = result.pendingPattern;
    await chrome.storage.local.remove('pendingPattern');

    sourceUrl = su || '';
    newPatternInput.value = pattern;
    newLabelInput.value   = '';
    suggestNote.textContent = su ? `Source: ${su}` : '';

    newPatternInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    newLabelInput.focus();
  }

  // Update suggest button note based on API key presence
  async function updateSuggestNote() {
    const { aiApiKey } = await chrome.storage.local.get('aiApiKey');
    if (!aiApiKey) {
      suggestNote.textContent = suggestNote.textContent || '(configure API key on AI tab)';
    }
  }

  // === AI CONFIG TAB ===

  const aiApiKeyInput      = document.getElementById('aiApiKey');
  const aiModelInput       = document.getElementById('aiModel');
  const saveAiBtn          = document.getElementById('saveAiBtn');
  const aiConfigStatus     = document.getElementById('aiConfigStatus');
  const aiPromptTextarea   = document.getElementById('aiPromptTemplate');
  const savePromptBtn      = document.getElementById('savePromptBtn');
  const resetPromptBtn     = document.getElementById('resetPromptBtn');
  const aiPromptStatus     = document.getElementById('aiPromptStatus');

  const DEFAULT_PROMPT = `Given this browser tab:
URL: {url}
Title: {title}

Suggest a URL glob pattern and a short reason label for a browser tab declutter tool.
The pattern should generalise this URL so similar tabs match it — use * as a wildcard for variable parts like IDs, usernames, slugs, or hash fragments.
The label should briefly explain why these tabs are safe to close (e.g. "reopenable", "auto-saved", "ephemeral").

Respond with only a JSON object, no markdown or explanation:
{"pattern": "example.com/*/path/*", "label": "Short reason (reopenable)"}`;

  async function loadAiConfig() {
    const result = await chrome.storage.local.get(['aiApiKey', 'aiModel', 'aiPromptTemplate']);
    if (result.aiApiKey)        aiApiKeyInput.value    = result.aiApiKey;
    if (result.aiModel)         aiModelInput.value     = result.aiModel;
    aiPromptTextarea.value = result.aiPromptTemplate || DEFAULT_PROMPT;
  }

  saveAiBtn.addEventListener('click', async () => {
    const apiKey = aiApiKeyInput.value.trim();
    const model  = aiModelInput.value.trim();
    if (!apiKey) { showStatus(aiConfigStatus, 'API key is required', 'error'); return; }
    await chrome.storage.local.set({
      aiApiKey: apiKey,
      aiModel:  model || 'claude-haiku-4-5-20251001'
    });
    showStatus(aiConfigStatus, 'Saved', 'success');
  });

  savePromptBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({ aiPromptTemplate: aiPromptTextarea.value });
    showStatus(aiPromptStatus, 'Prompt saved', 'success');
  });

  resetPromptBtn.addEventListener('click', () => {
    aiPromptTextarea.value = DEFAULT_PROMPT;
    showStatus(aiPromptStatus, 'Reset to default (not yet saved)', 'info');
  });

  // === HELPERS ===

  function showStatus(el, html, type) {
    el.innerHTML = html;
    el.className = `status ${type}`;
    if (type === 'success') {
      setTimeout(() => { el.innerHTML = ''; el.className = ''; }, 3000);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Listen for pendingPattern changes when the page is already open
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pendingPattern && changes.pendingPattern.newValue) {
      checkPendingPattern();
    }
  });

  // === INIT ===
  loadPatterns();
  loadAiConfig();
  checkPendingPattern();
  updateSuggestNote();
});
