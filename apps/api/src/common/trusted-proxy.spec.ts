import { describe, expect, it } from 'vitest';
import { trustedProxyHops } from './trusted-proxy';

describe('trustedProxyHops', () => {
  it('assumes one proxy when nothing is set, which is what a single host in front looks like', () => {
    expect(trustedProxyHops(undefined)).toBe(1);
    expect(trustedProxyHops('')).toBe(1);
    expect(trustedProxyHops('   ')).toBe(1);
  });

  it('takes a hop count', () => {
    expect(trustedProxyHops('0')).toBe(0);
    expect(trustedProxyHops('1')).toBe(1);
    expect(trustedProxyHops(' 2 ')).toBe(2);
  });

  it('refuses "true", which would trust a forged X-Forwarded-For', () => {
    // The failure this guards against is the dangerous direction: believing
    // the whole chain lets one caller present a new address per request and
    // never be rate limited.
    expect(() => trustedProxyHops('true')).toThrow(/whole number/i);
  });

  it('refuses anything that is not a plain whole number', () => {
    for (const bad of ['-1', '1.5', 'one', '2 proxies', '1,2', 'yes']) {
      expect(() => trustedProxyHops(bad)).toThrow(/whole number/i);
    }
  });

  it('refuses a count larger than any real deployment', () => {
    expect(() => trustedProxyHops('11')).toThrow(/more proxies/i);
    expect(trustedProxyHops('10')).toBe(10);
  });
});
