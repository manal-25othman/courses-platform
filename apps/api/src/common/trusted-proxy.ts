/**
 * How many proxies sit in front of the API.
 *
 * Express decides a caller's address from the socket unless it is told
 * otherwise. Behind a host that terminates TLS — Render, Railway, anything of
 * that shape — the socket address is the proxy's, and it is the same for
 * everybody. The sign-in rate limit is counted against that address, so
 * without this setting the whole platform shares one budget of ten attempts a
 * minute: a class signing in together locks itself out after the tenth girl.
 *
 * The number is a hop count, not a switch, and that distinction is the whole
 * point. `trust proxy: true` tells Express to believe the entire
 * `X-Forwarded-For` chain, and since anyone can put anything in that header, a
 * single attacker could then present a fresh address on every request and
 * never be limited at all — the opposite failure, and a worse one. A count
 * says "believe exactly this many entries from the right", so only the hops we
 * actually run behind can speak.
 *
 * One is right for a single host in front of the API, which is the pilot's
 * shape. A CDN added ahead of that host makes it two. Zero is honest for
 * running with nothing in front, which is what a developer machine is.
 */

/** Above this, a "hop count" is not a deployment any more, it is a typo. */
const MOST_PLAUSIBLE_HOPS = 10;

export function trustedProxyHops(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 1;

  const value = raw.trim();

  // Deliberately strict. `Number('true')` is NaN but `Number('')` is 0 and
  // `parseInt('2 proxies')` is 2, and a setting that quietly accepts nonsense
  // is how a security control ends up switched off without anybody noticing.
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `TRUSTED_PROXY_HOPS must be a whole number of proxies in front of the API, not "${raw}". ` +
        'Use 1 for a single host such as Render, 2 if a CDN sits in front of it, ' +
        '0 for nothing at all. Never "true": that would trust a forged ' +
        'X-Forwarded-For and remove the sign-in rate limit entirely.',
    );
  }

  const hops = Number(value);

  if (hops > MOST_PLAUSIBLE_HOPS) {
    throw new Error(
      `TRUSTED_PROXY_HOPS is ${hops}, which is more proxies than any deployment of this ` +
        `platform has. Trusting that far down an X-Forwarded-For chain lets a caller forge ` +
        `their own address. The most this accepts is ${MOST_PLAUSIBLE_HOPS}.`,
    );
  }

  return hops;
}
