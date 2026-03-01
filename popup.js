// Popup script for Tab Organizer extension

document.addEventListener('DOMContentLoaded', function () {
  const sortActivityBtn = document.getElementById('sortActivityBtn');
  const sortTitleBtn    = document.getElementById('sortTitleBtn');
  const reverseBtn      = document.getElementById('reverseBtn');
  const declutterBtn    = document.getElementById('declutterBtn');
  const optionsBtn      = document.getElementById('optionsBtn');
  const statusMsg       = document.getElementById('statusMsg');
  const flaggedList     = document.getElementById('flaggedList');
  const flaggedItems    = document.getElementById('flaggedItems');
  const closeAllBtn     = document.getElementById('closeAllBtn');

  reverseBtn.addEventListener('click', async () => {
    reverseBtn.disabled = true;
    showStatus('<span class="spinner"></span>Reversing…', 'info');
    try {
      const response = await chrome.runtime.sendMessage({ action: 'reverseTabs' });
      if (response.success) {
        showStatus(`Reversed ${response.result.reversed} tabs`, 'success');
      } else {
        showStatus(`Error: ${response.error}`, 'error');
      }
    } catch {
      showStatus('Failed to reverse tabs', 'error');
    } finally {
      reverseBtn.disabled = false;
    }
  });

  optionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

  // === SORT ===

  sortActivityBtn.addEventListener('click', () => doSort('activity'));
  sortTitleBtn.addEventListener('click',    () => doSort('title'));

  async function doSort(sortBy) {
    const direction = sortBy === 'title' ? 'asc' : 'desc';
    const btn = sortBy === 'activity' ? sortActivityBtn : sortTitleBtn;
    btn.disabled = true;
    showStatus('<span class="spinner"></span>Sorting…', 'info');

    try {
      const response = await chrome.runtime.sendMessage({ action: 'sortByActivity', sortBy, direction });
      if (response.success) {
        const label = sortBy === 'activity' ? 'most recent first' : 'A → Z';
        showStatus(`Sorted ${response.result.sorted} tabs — ${label}`, 'success');
      } else {
        showStatus(`Error: ${response.error}`, 'error');
      }
    } catch {
      showStatus('Failed to sort tabs', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  // === SORT BY TOPIC ===

  const sortTopicBtn = document.getElementById('sortTopicBtn');

  sortTopicBtn.addEventListener('click', async () => {
    sortTopicBtn.disabled = true;
    showStatus('<span class="spinner"></span>Asking AI to group by topic…', 'info');
    try {
      const response = await chrome.runtime.sendMessage({ action: 'sortByTopic' });
      if (response.success) {
        showStatus(`Grouped ${response.result.sorted} tabs by topic`, 'success');
      } else {
        showStatus(`Error: ${response.error}`, 'error');
      }
    } catch {
      showStatus('Failed to sort by topic', 'error');
    } finally {
      sortTopicBtn.disabled = false;
    }
  });

  // === DECLUTTER ===

  declutterBtn.addEventListener('click', async () => {
    declutterBtn.disabled = true;
    flaggedList.style.display = 'none';
    flaggedItems.innerHTML = '';
    closeAllBtn.style.display = 'none';
    showStatus('<span class="spinner"></span>Scanning…', 'info');

    try {
      const response = await chrome.runtime.sendMessage({ action: 'getDispensable' });
      if (!response.success) throw new Error(response.error);

      const flagged = response.flagged;
      hideStatus();
      flaggedList.style.display = 'block';

      if (flagged.length === 0) {
        flaggedItems.innerHTML = '<div class="empty-msg">No redundant tabs found</div>';
      } else {
        renderFlaggedItems(flagged);
        closeAllBtn.style.display = 'block';
        showStatus(`Found ${flagged.length} tab${flagged.length > 1 ? 's' : ''} to review`, 'info');
      }
    } catch {
      showStatus('Failed to scan tabs', 'error');
    } finally {
      declutterBtn.disabled = false;
    }
  });

  // Single delegated click listener for individual close buttons (registered once)
  flaggedItems.addEventListener('click', async e => {
    const btn = e.target.closest('.close-tab-btn');
    if (!btn) return;
    const tabId = parseInt(btn.dataset.tabId);
    btn.disabled = true;
    try {
      await chrome.runtime.sendMessage({ action: 'closeTabs', tabIds: [tabId] });
      btn.closest('.flagged-item').remove();
      updateCloseAllVisibility();
    } catch {
      btn.disabled = false;
    }
  });

  function renderFlaggedItems(flagged) {
    flaggedItems.innerHTML = '';
    closeAllBtn.disabled = false;
    for (const item of flagged) {
      const el = document.createElement('div');
      el.className = 'flagged-item';
      el.dataset.tabId = item.tabId;
      el.innerHTML = `
        <div class="flagged-info">
          <div class="flagged-title" title="${escapeHtml(item.title)}">${escapeHtml(truncate(item.title, 34))}</div>
          <div class="flagged-reason">${escapeHtml(item.domain)} — ${escapeHtml(item.reason)}</div>
        </div>
        <button class="close-tab-btn" data-tab-id="${item.tabId}">✕</button>
      `;
      flaggedItems.appendChild(el);
    }
  }

  closeAllBtn.addEventListener('click', async () => {
    const rows = flaggedItems.querySelectorAll('.flagged-item');
    const tabIds = Array.from(rows).map(r => parseInt(r.dataset.tabId)).filter(Boolean);
    if (!tabIds.length) return;
    closeAllBtn.disabled = true;
    try {
      await chrome.runtime.sendMessage({ action: 'closeTabs', tabIds });
      flaggedItems.innerHTML = '<div class="empty-msg">All flagged tabs closed</div>';
      closeAllBtn.style.display = 'none';
      hideStatus();
    } catch {
      closeAllBtn.disabled = false;
    }
  });

  function updateCloseAllVisibility() {
    if (!flaggedItems.querySelectorAll('.flagged-item').length) {
      flaggedItems.innerHTML = '<div class="empty-msg">All flagged tabs closed</div>';
      closeAllBtn.style.display = 'none';
    }
  }

  // === ON-THE-FLY PATTERN PREVIEW ===

  const patternInput = document.getElementById('patternInput');
  let patternDebounce = null;

  patternInput.addEventListener('input', () => {
    clearTimeout(patternDebounce);
    const pattern = patternInput.value.trim();
    if (!pattern) {
      flaggedList.style.display = 'none';
      flaggedItems.innerHTML = '';
      closeAllBtn.style.display = 'none';
      hideStatus();
      return;
    }
    patternDebounce = setTimeout(async () => {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'matchPattern', pattern });
        if (!response.success) return;
        flaggedList.style.display = 'block';
        if (response.flagged.length === 0) {
          flaggedItems.innerHTML = '<div class="empty-msg">No tabs match this pattern</div>';
          closeAllBtn.style.display = 'none';
          hideStatus();
        } else {
          renderFlaggedItems(response.flagged);
          closeAllBtn.style.display = 'block';
          showStatus(`${response.flagged.length} tab${response.flagged.length > 1 ? 's' : ''} match`, 'info');
        }
      } catch { /* ignore */ }
    }, 250);
  });

  // === HELPERS ===

  function showStatus(html, type) {
    statusMsg.innerHTML = html;
    statusMsg.className = `status-msg ${type}`;
    statusMsg.style.display = 'block';
  }

  function hideStatus() {
    statusMsg.style.display = 'none';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max) + '…' : str;
  }
});
