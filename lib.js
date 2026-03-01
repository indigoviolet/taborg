// Shared pure functions for Tab Organizer
// Used by background.js (as importScripts) and by tests (as ES module)

function getDomain(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

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

// Export for tests (ES module), no-op in service worker (importScripts)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getDomain, globToRegex, matchesPattern, stripTrackingParams, TRACKING_PARAMS };
}
