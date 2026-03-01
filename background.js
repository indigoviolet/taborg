// Background service worker for Tab Organizer extension

chrome.runtime.onInstalled.addListener(() => {
  initTabData();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'addDeclutterPattern',
      title: 'Add to Declutter Patterns',
      contexts: ['page']
    });
  });
});

chrome.runtime.onStartup.addListener(() => {
  initTabData();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'addDeclutterPattern') return;

  let pattern = '';
  try {
    const parsed = new URL(info.pageUrl);
    // Strip trailing slash; user can add wildcards in the options form
    pattern = (parsed.hostname + parsed.pathname).replace(/\/$/, '');
  } catch {
    pattern = info.pageUrl;
  }

  chrome.storage.local.set({ pendingPattern: { pattern, sourceUrl: info.pageUrl, title: tab?.title || '' } }, () => {
    chrome.runtime.openOptionsPage();
  });
});

// === TAB ACTIVITY TRACKING ===

function getDomain(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

async function getTabData() {
  const result = await chrome.storage.local.get('tabData');
  return result.tabData || {};
}

async function setTabData(tabData) {
  await chrome.storage.local.set({ tabData });
}

async function initTabData() {
  const tabs = await chrome.tabs.query({});
  const tabData = await getTabData();
  const now = Date.now();

  for (const tab of tabs) {
    if (!tabData[tab.id]) {
      tabData[tab.id] = {
        url: tab.url || '',
        title: tab.title || '',
        domain: getDomain(tab.url),
        openerTabId: null,
        createdAt: now,
        lastActivatedAt: now,
        activationCount: 0,
        totalFocusMs: 0,
        _focusStart: null
      };
    }
  }

  // Prune stale entries for tabs that no longer exist
  const tabIdSet = new Set(tabs.map(t => t.id));
  for (const id of Object.keys(tabData)) {
    if (!tabIdSet.has(parseInt(id))) {
      delete tabData[id];
    }
  }

  await setTabData(tabData);
}

chrome.tabs.onCreated.addListener(async (tab) => {
  const tabData = await getTabData();
  tabData[tab.id] = {
    url: tab.url || '',
    title: tab.title || '',
    domain: getDomain(tab.url),
    openerTabId: tab.openerTabId || null,
    createdAt: Date.now(),
    lastActivatedAt: Date.now(),
    activationCount: 0,
    totalFocusMs: 0,
    _focusStart: null
  };
  await setTabData(tabData);
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const now = Date.now();
  const tabData = await getTabData();
  const storageResult = await chrome.storage.local.get(`lastActiveTabId_${activeInfo.windowId}`);
  const lastActiveTabId = storageResult[`lastActiveTabId_${activeInfo.windowId}`];

  // Accumulate focus time for the previously active tab
  if (lastActiveTabId && tabData[lastActiveTabId] && tabData[lastActiveTabId]._focusStart) {
    tabData[lastActiveTabId].totalFocusMs += now - tabData[lastActiveTabId]._focusStart;
    tabData[lastActiveTabId]._focusStart = null;
  }

  // Update the newly activated tab
  if (!tabData[activeInfo.tabId]) {
    tabData[activeInfo.tabId] = {
      url: '',
      title: '',
      domain: '',
      openerTabId: null,
      createdAt: now,
      lastActivatedAt: now,
      activationCount: 1,
      totalFocusMs: 0,
      _focusStart: now
    };
  } else {
    tabData[activeInfo.tabId].lastActivatedAt = now;
    tabData[activeInfo.tabId].activationCount = (tabData[activeInfo.tabId].activationCount || 0) + 1;
    tabData[activeInfo.tabId]._focusStart = now;
  }

  await chrome.storage.local.set({
    tabData,
    [`lastActiveTabId_${activeInfo.windowId}`]: activeInfo.tabId
  });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;

  const tabData = await getTabData();
  if (tabData[tabId]) {
    tabData[tabId].url = tab.url || tabData[tabId].url;
    tabData[tabId].title = tab.title || tabData[tabId].title;
    tabData[tabId].domain = getDomain(tab.url) || tabData[tabId].domain;
  } else {
    tabData[tabId] = {
      url: tab.url || '',
      title: tab.title || '',
      domain: getDomain(tab.url),
      openerTabId: null,
      createdAt: Date.now(),
      lastActivatedAt: Date.now(),
      activationCount: 0,
      totalFocusMs: 0,
      _focusStart: null
    };
  }
  await setTabData(tabData);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabData = await getTabData();
  if (tabData[tabId]) {
    delete tabData[tabId];
    await setTabData(tabData);
  }
});

// === SORT BY ACTIVITY ===

async function sortByActivity(sortBy, direction) {
  sortBy = sortBy || 'activity';
  direction = direction || 'desc';
  const currentWindow = await chrome.windows.getCurrent();
  const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
  const tabData = await getTabData();

  // Comparator and group representative picker depend on sort mode
  let cmp, groupRepKey;

  if (sortBy === 'title') {
    const titleOf = tab => (tab.title || '').toLowerCase();
    cmp = direction === 'asc'
      ? (a, b) => titleOf(a).localeCompare(titleOf(b))
      : (a, b) => titleOf(b).localeCompare(titleOf(a));
    // Representative: alphabetically first (asc) or last (desc) title in the group
    groupRepKey = (groupTabs) => {
      const titles = groupTabs.map(t => titleOf(t)).sort();
      return direction === 'asc' ? titles[0] : titles[titles.length - 1];
    };
  } else {
    const activityKey = tab => {
      const data = tabData[tab.id];
      return data ? (data.lastActivatedAt || data.createdAt || 0) : 0;
    };
    cmp = direction === 'asc'
      ? (a, b) => activityKey(a) - activityKey(b)
      : (a, b) => activityKey(b) - activityKey(a);
    groupRepKey = (groupTabs) => {
      const keys = groupTabs.map(activityKey);
      return direction === 'asc' ? Math.min(...keys) : Math.max(...keys);
    };
  }

  const pinnedTabs = tabs.filter(t => t.pinned);
  const ungroupedTabs = tabs.filter(t => !t.pinned && t.groupId === -1);

  // Build groupId -> tabs map
  const groupsMap = new Map();
  for (const tab of tabs) {
    if (!tab.pinned && tab.groupId !== -1) {
      if (!groupsMap.has(tab.groupId)) groupsMap.set(tab.groupId, []);
      groupsMap.get(tab.groupId).push(tab);
    }
  }

  // Sort ungrouped tabs
  ungroupedTabs.sort(cmp);

  // Sort within each group and compute representative sort key
  const sortedGroupsList = [];
  for (const [groupId, groupTabs] of groupsMap) {
    groupTabs.sort(cmp);
    sortedGroupsList.push({ groupId, tabs: groupTabs, repKey: groupRepKey(groupTabs) });
  }

  // Sort groups by their representative key
  if (sortBy === 'title') {
    sortedGroupsList.sort((a, b) =>
      direction === 'asc'
        ? a.repKey.localeCompare(b.repKey)
        : b.repKey.localeCompare(a.repKey)
    );
  } else {
    sortedGroupsList.sort((a, b) =>
      direction === 'asc' ? a.repKey - b.repKey : b.repKey - a.repKey
    );
  }

  // Final order: [groups in sorted order] [ungrouped]
  const nonPinnedOrder = [
    ...sortedGroupsList.flatMap(g => g.tabs),
    ...ungroupedTabs
  ];

  // Apply moves starting after pinned tabs
  const startIndex = pinnedTabs.length;
  for (let i = 0; i < nonPinnedOrder.length; i++) {
    try {
      await chrome.tabs.move(nonPinnedOrder[i].id, { index: startIndex + i });
    } catch (err) {
      console.warn(`Could not move tab ${nonPinnedOrder[i].id}:`, err.message);
    }
  }

  return { sorted: nonPinnedOrder.length };
}

// === DECLUTTER / DISPENSABLE TAB DETECTION ===

function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexStr = escaped.replace(/\*/g, '[^?#]*');
  return new RegExp('^' + regexStr + '($|[?#/])');
}

function matchesPattern(url, pattern) {
  try {
    const parsed = new URL(url);
    const target = /^https?:\/\//i.test(pattern)
      ? url
      : parsed.hostname + parsed.pathname;
    return globToRegex(pattern).test(target);
  } catch {
    return false;
  }
}

const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'dclid', 'msclkid',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'mc_cid', 'mc_eid',
  'ref', '_ref', 'ref_', 'referer',
  'yclid', 'twclid', 'ttclid', 'li_fat_id',
  'igshid', 'si',
  '_ga', '_gl', '_hsenc', '_hsmi', '_openstat',
  'ns_mchannel', 'ns_source', 'ns_campaign', 'ns_linkname', 'ns_fee',
]);

function stripTrackingParams(url) {
  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;
    const toDelete = [];
    for (const key of params.keys()) {
      if (TRACKING_PARAMS.has(key) || key.startsWith('utm_')) toDelete.push(key);
    }
    for (const key of toDelete) params.delete(key);
    return parsed.toString();
  } catch {
    return url;
  }
}

const DEFAULT_PATTERNS = [
  { pattern: 'github.com/*/pull/*', label: 'GitHub PR (reopenable)' },
  { pattern: 'github.com/*/issues/*', label: 'GitHub Issue (reopenable)' },
  { pattern: 'app.slack.com/*', label: 'Slack (reopenable)' },
  { pattern: 'mail.google.com/mail/*', label: 'Gmail thread (reopenable)' }
];

async function getDispensable() {
  const currentWindow = await chrome.windows.getCurrent();
  const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
  const tabData = await getTabData();

  const { declutterPatterns } = await chrome.storage.local.get('declutterPatterns');
  const patterns = declutterPatterns || DEFAULT_PATTERNS;

  const flagged = [];

  // Tier 1: URL duplicates (ignoring tracking params) — keep the most recently active, flag the rest
  const urlToKeeper = new Map();
  for (const tab of tabs) {
    if (tab.pinned) continue;
    const url = tab.url;
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) continue;
    const canonical = stripTrackingParams(url);
    const lastActive = tabData[tab.id]?.lastActivatedAt || 0;
    if (!urlToKeeper.has(canonical) || lastActive > (tabData[urlToKeeper.get(canonical).id]?.lastActivatedAt || 0)) {
      urlToKeeper.set(canonical, tab);
    }
  }

  const urlCounts = new Map();
  for (const tab of tabs) {
    if (tab.pinned) continue;
    const url = tab.url;
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) continue;
    const canonical = stripTrackingParams(url);
    urlCounts.set(canonical, (urlCounts.get(canonical) || 0) + 1);
  }

  for (const tab of tabs) {
    if (tab.pinned) continue;
    const url = tab.url;
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) continue;
    const canonical = stripTrackingParams(url);
    if ((urlCounts.get(canonical) || 0) > 1 && urlToKeeper.get(canonical)?.id !== tab.id) {
      flagged.push({ tabId: tab.id, title: tab.title || url, url, domain: getDomain(url), reason: 'Duplicate tab' });
    }
  }

  // Tier 2: Pattern-based matching
  const flaggedIds = new Set(flagged.map(f => f.tabId));
  for (const tab of tabs) {
    if (tab.pinned) continue;
    if (flaggedIds.has(tab.id)) continue;
    const url = tab.url;
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) continue;
    for (const { pattern, label } of patterns) {
      if (matchesPattern(url, pattern)) {
        flagged.push({ tabId: tab.id, title: tab.title || url, url, domain: getDomain(url), reason: label });
        break;
      }
    }
  }

  return flagged;
}

// === REVERSE TAB ORDER ===

async function reverseTabs() {
  const currentWindow = await chrome.windows.getCurrent();
  const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
  const pinned = tabs.filter(t => t.pinned);
  const rest = tabs.filter(t => !t.pinned).reverse();
  const startIndex = pinned.length;
  for (let i = 0; i < rest.length; i++) {
    try {
      await chrome.tabs.move(rest[i].id, { index: startIndex + i });
    } catch (err) {
      console.warn(`Could not move tab ${rest[i].id}:`, err.message);
    }
  }
  return { reversed: rest.length };
}

// === AI SUGGESTION ===

async function suggestPattern(apiKey, model, prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${response.status} — ${err}`);
  }
  const data = await response.json();
  const text = data.content[0].text;
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) throw new Error('No JSON found in response');
  return JSON.parse(match[0]);
}

// === MESSAGE HANDLER ===

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'reverseTabs') {
    reverseTabs()
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'suggestPattern') {
    suggestPattern(request.apiKey, request.model, request.prompt)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'sortByActivity') {
    sortByActivity(request.sortBy, request.direction)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'getDispensable') {
    getDispensable()
      .then(flagged => sendResponse({ success: true, flagged }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'matchPattern') {
    (async () => {
      try {
        const currentWindow = await chrome.windows.getCurrent();
        const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
        const matched = [];
        for (const tab of tabs) {
          if (tab.pinned) continue;
          const url = tab.url;
          if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) continue;
          const wrappedPattern = '*' + request.pattern + '*';
          const titleRegex = new RegExp(globToRegex(wrappedPattern).source, 'i');
          const titleMatch = tab.title && titleRegex.test(tab.title);
          if (matchesPattern(url, request.pattern) || titleMatch) {
            matched.push({ tabId: tab.id, title: tab.title || url, url, domain: getDomain(url), reason: request.pattern });
          }
        }
        sendResponse({ success: true, flagged: matched });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  } else if (request.action === 'closeTabs') {
    chrome.tabs.remove(request.tabIds)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});
