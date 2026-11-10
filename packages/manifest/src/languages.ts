/** RFC 5646 well-formed syntax; independent of optional host Intl implementations. */
export function isLanguageTag(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 80) return false;
  const tag = value.toLowerCase();
  const grandfathered = ['art-lojban', 'cel-gaulish', 'en-gb-oed', 'i-ami', 'i-bnn', 'i-default', 'i-enochian', 'i-hak', 'i-klingon', 'i-lux', 'i-mingo', 'i-navajo', 'i-pwn', 'i-tao', 'i-tay', 'i-tsu', 'no-bok', 'no-nyn', 'sgn-be-fr', 'sgn-be-nl', 'sgn-ch-de', 'zh-guoyu', 'zh-hakka', 'zh-min', 'zh-min-nan', 'zh-xiang'];
  if (grandfathered.includes(tag)) return true;
  if (!/^(?:(?:[a-z]{2,3}(?:-[a-z]{3}){0,3}|[a-z]{4}|[a-z]{5,8})(?:-[a-z]{4})?(?:-(?:[a-z]{2}|[0-9]{3}))?(?:-(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*(?:-[0-9a-wy-z](?:-[a-z0-9]{2,8})+)*(?:-x(?:-[a-z0-9]{1,8})+)?|x(?:-[a-z0-9]{1,8})+)$/.test(tag)) return false;
  const parts = tag.split('-'); const singletons = new Set<string>(); const variants = new Set<string>(); let extension = false;
  for (const part of parts.slice(1)) {
    if (part === 'x') break;
    if (part.length === 1) { if (singletons.has(part)) return false; singletons.add(part); extension = true; }
    else if (!extension && /^(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3})$/.test(part)) { if (variants.has(part)) return false; variants.add(part); }
  }
  return true;
}
