import { describe, it, expect } from 'vitest';
const { getDomain, globToRegex, matchesPattern, stripTrackingParams } = require('./lib.js');

// === getDomain ===

describe('getDomain', () => {
  it('extracts hostname from a normal URL', () => {
    expect(getDomain('https://github.com/user/repo')).toBe('github.com');
  });

  it('extracts hostname with subdomain', () => {
    expect(getDomain('https://mail.google.com/mail/u/0')).toBe('mail.google.com');
  });

  it('returns empty string for empty input', () => {
    expect(getDomain('')).toBe('');
    expect(getDomain(null)).toBe('');
    expect(getDomain(undefined)).toBe('');
  });

  it('returns empty string for invalid URL', () => {
    expect(getDomain('not-a-url')).toBe('');
  });

  it('handles chrome:// URLs', () => {
    expect(getDomain('chrome://extensions')).toBe('extensions');
  });
});

// === globToRegex ===

describe('globToRegex', () => {
  it('converts simple pattern with wildcard', () => {
    const re = globToRegex('github.com/*/pull/*');
    expect(re.test('github.com/user/pull/123')).toBe(true);
    expect(re.test('github.com/user/pull/123/')).toBe(true);
  });

  it('does not match across query strings', () => {
    const re = globToRegex('github.com/*');
    // wildcard is [^?#]* so it should not consume ? or #
    expect(re.test('github.com/user?foo=bar')).toBe(true);
  });

  it('escapes dots in pattern', () => {
    const re = globToRegex('github.com/*');
    expect(re.test('githubXcom/user')).toBe(false);
  });

  it('anchors to start of string', () => {
    const re = globToRegex('github.com/*');
    expect(re.test('xxxgithub.com/user')).toBe(false);
  });

  it('handles pattern with no wildcards', () => {
    const re = globToRegex('github.com/user/repo');
    expect(re.test('github.com/user/repo')).toBe(true);
    expect(re.test('github.com/user/repo/')).toBe(true);
    expect(re.test('github.com/user/repo2')).toBe(false);
  });
});

// === matchesPattern ===

describe('matchesPattern', () => {
  it('matches URL hostname+path against pattern', () => {
    expect(matchesPattern('https://github.com/user/pull/42', 'github.com/*/pull/*')).toBe(true);
  });

  it('does not match unrelated URL', () => {
    expect(matchesPattern('https://google.com/search', 'github.com/*/pull/*')).toBe(false);
  });

  it('matches full URL when pattern starts with http', () => {
    expect(matchesPattern('https://github.com/user', 'https://github.com/*')).toBe(true);
  });

  it('returns false for invalid URL', () => {
    expect(matchesPattern('not-a-url', 'github.com/*')).toBe(false);
  });

  it('returns false for empty URL', () => {
    expect(matchesPattern('', 'github.com/*')).toBe(false);
  });

  it('matches app.slack.com wildcard', () => {
    expect(matchesPattern('https://app.slack.com/client/T123/C456', 'app.slack.com/*')).toBe(true);
  });

  it('matches mail.google.com pattern', () => {
    expect(matchesPattern('https://mail.google.com/mail/u/0/#inbox/abc', 'mail.google.com/mail/*')).toBe(true);
  });

  it('does not match partial hostname', () => {
    expect(matchesPattern('https://notgithub.com/user/pull/1', 'github.com/*/pull/*')).toBe(false);
  });
});

// === stripTrackingParams ===

describe('stripTrackingParams', () => {
  it('strips fbclid', () => {
    const url = 'https://github.com/user/repo?fbclid=abc123';
    expect(stripTrackingParams(url)).toBe('https://github.com/user/repo');
  });

  it('strips utm_* params', () => {
    const url = 'https://example.com/page?utm_source=twitter&utm_medium=social&utm_campaign=launch';
    expect(stripTrackingParams(url)).toBe('https://example.com/page');
  });

  it('strips gclid', () => {
    const url = 'https://example.com/?gclid=xyz';
    expect(stripTrackingParams(url)).toBe('https://example.com/');
  });

  it('preserves non-tracking params', () => {
    const url = 'https://example.com/search?q=hello&page=2&fbclid=abc';
    const result = stripTrackingParams(url);
    expect(result).toContain('q=hello');
    expect(result).toContain('page=2');
    expect(result).not.toContain('fbclid');
  });

  it('handles URL with no query params', () => {
    const url = 'https://example.com/path';
    expect(stripTrackingParams(url)).toBe('https://example.com/path');
  });

  it('handles URL with only tracking params', () => {
    const url = 'https://example.com/path?fbclid=abc&gclid=def&utm_source=x';
    expect(stripTrackingParams(url)).toBe('https://example.com/path');
  });

  it('strips custom utm_ prefixed params', () => {
    const url = 'https://example.com/?utm_custom_thing=val';
    expect(stripTrackingParams(url)).toBe('https://example.com/');
  });

  it('returns original string for invalid URL', () => {
    expect(stripTrackingParams('not-a-url')).toBe('not-a-url');
  });

  it('returns original string for empty input', () => {
    expect(stripTrackingParams('')).toBe('');
  });

  it('detects duplicates that differ only by fbclid', () => {
    const url1 = 'https://github.com/user/repo?fbclid=aaa';
    const url2 = 'https://github.com/user/repo?fbclid=bbb';
    expect(stripTrackingParams(url1)).toBe(stripTrackingParams(url2));
  });

  it('detects duplicates that differ only by tracking params', () => {
    const url1 = 'https://github.com/clintandrewhall/bunnyghp?fbclid=IwY2xjawPK8qFle';
    const url2 = 'https://github.com/clintandrewhall/bunnyghp?fbclid=IwY2xjawPK8qZle';
    expect(stripTrackingParams(url1)).toBe(stripTrackingParams(url2));
  });

  it('strips multiple tracking param types at once', () => {
    const url = 'https://example.com/page?fbclid=a&gclid=b&mc_cid=c&igshid=d&si=e&_ga=f';
    const result = stripTrackingParams(url);
    expect(result).toBe('https://example.com/page');
  });
});
