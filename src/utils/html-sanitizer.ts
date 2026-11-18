/**
 * Server-side HTML Sanitizer Utility
 * Sanitizes rich-text user inputs using strict allow-lists and safe link attributes.
 */

const ALLOWED_TAGS = new Set([
  'p',
  'b',
  'strong',
  'i',
  'em',
  'u',
  'ul',
  'ol',
  'li',
  'a',
  'h3',
  'h4',
  'h5',
  'br',
  'blockquote',
  'span',
]);

const ALLOWED_SCHEMES = ['http:', 'https:', 'mailto:'];

export function sanitizeHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return '';

  let sanitized = rawHtml;

  // 1. Completely strip script, style, iframe, object, embed, form, input tags and contents
  sanitized = sanitized.replace(
    /<(script|style|iframe|object|embed|form|input|button|svg|math)[^>]*>[\s\S]*?<\/\1>/gi,
    '',
  );
  sanitized = sanitized.replace(
    /<(script|style|iframe|object|embed|form|input|button|svg|math)[^>]*\/?>/gi,
    '',
  );

  // 2. Strip HTML comments
  sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, '');

  // 3. Process remaining tags against allow-list and sanitize attributes
  sanitized = sanitized.replace(/<\/?([a-zA-Z0-9_-]+)([^>]*)>/gi, (fullMatch, tagName, rawAttrs) => {
    const tagLower = tagName.toLowerCase();

    // If tag is not allowed, strip the tag but keep text
    if (!ALLOWED_TAGS.has(tagLower)) {
      return '';
    }

    // Closing tag
    if (fullMatch.startsWith('</')) {
      return `</${tagLower}>`;
    }

    // Self-closing or void tags
    if (tagLower === 'br') {
      return '<br />';
    }

    // For allowed <a> tags, extract and sanitize href
    if (tagLower === 'a') {
      const hrefMatch = rawAttrs.match(/href=(["'])(.*?)\1/i) || rawAttrs.match(/href=([^\s>]+)/i);
      let href = hrefMatch ? (hrefMatch[2] || hrefMatch[1]).trim() : '';

      try {
        const parsedUrl = new URL(href, 'https://campus.edu');
        if (!ALLOWED_SCHEMES.includes(parsedUrl.protocol)) {
          href = '#';
        }
      } catch {
        href = '#';
      }

      // Force secure external link attributes
      return `<a href="${encodeURI(href)}" target="_blank" rel="noopener noreferrer">`;
    }

    // For all other allowed tags, strip any attributes to prevent style or handler injections
    return `<${tagLower}>`;
  });

  return sanitized.trim();
}

const ALLOWED_STORY_TAGS = new Set([
  'p',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'ul',
  'ol',
  'li',
  'hr',
  'br',
  'a',
  'figure',
  'figcaption',
  'img',
  'video',
  'source',
]);

export function calculateReadingTime(html: string): number {
  if (!html || typeof html !== 'string') return 1;
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  return Math.max(1, Math.ceil(words / 200));
}

export function sanitizeStoryHtml(rawHtml: string, cloudName?: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return '';

  let sanitized = rawHtml;

  // 1. Completely strip dangerous executable tags and contents
  sanitized = sanitized.replace(
    /<(script|style|iframe|object|embed|form|input|button|svg|math)[^>]*>[\s\S]*?<\/\1>/gi,
    '',
  );
  sanitized = sanitized.replace(
    /<(script|style|iframe|object|embed|form|input|button|svg|math)[^>]*\/?>/gi,
    '',
  );

  // 2. Strip HTML comments
  sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, '');

  const validCloudinaryPrefix = cloudName
    ? `https://res.cloudinary.com/${cloudName}/`
    : 'https://res.cloudinary.com/';

  // 3. Process tags
  sanitized = sanitized.replace(/<\/?([a-zA-Z0-9_-]+)([^>]*)>/gi, (fullMatch, tagName, rawAttrs) => {
    const tagLower = tagName.toLowerCase();

    if (!ALLOWED_STORY_TAGS.has(tagLower)) {
      return '';
    }

    if (fullMatch.startsWith('</')) {
      if (['img', 'br', 'hr', 'source'].includes(tagLower)) return '';
      return `</${tagLower}>`;
    }

    if (tagLower === 'br') return '<br />';
    if (tagLower === 'hr') return '<hr class="my-6 border-slate-200" />';

    if (tagLower === 'a') {
      const hrefMatch = rawAttrs.match(/href=(["'])(.*?)\1/i) || rawAttrs.match(/href=([^\s>]+)/i);
      let href = hrefMatch ? (hrefMatch[2] || hrefMatch[1]).trim() : '';

      try {
        const parsedUrl = new URL(href, 'https://campus.edu');
        if (!ALLOWED_SCHEMES.includes(parsedUrl.protocol)) {
          href = '#';
        }
      } catch {
        href = '#';
      }
      return `<a href="${encodeURI(href)}" target="_blank" rel="noopener noreferrer">`;
    }

    if (tagLower === 'img') {
      const srcMatch = rawAttrs.match(/src=(["'])(.*?)\1/i) || rawAttrs.match(/src=([^\s>]+)/i);
      const altMatch = rawAttrs.match(/alt=(["'])(.*?)\1/i) || rawAttrs.match(/alt=([^\s>]+)/i);

      const src = srcMatch ? (srcMatch[2] || srcMatch[1]).trim() : '';
      const alt = altMatch ? (altMatch[2] || altMatch[1]).trim().replace(/"/g, '&quot;') : 'Story illustration';

      // Enforce verified Cloudinary domain only
      if (!src || !src.startsWith(validCloudinaryPrefix)) {
        return '';
      }

      return `<img src="${encodeURI(src)}" alt="${alt}" class="rounded-xl max-w-full my-6 shadow-sm" loading="lazy" />`;
    }

    if (tagLower === 'video') {
      const srcMatch = rawAttrs.match(/src=(["'])(.*?)\1/i) || rawAttrs.match(/src=([^\s>]+)/i);
      const src = srcMatch ? (srcMatch[2] || srcMatch[1]).trim() : '';

      if (src) {
        if (!src.startsWith(validCloudinaryPrefix)) {
          return '';
        }
        return `<video controls preload="metadata" playsinline class="w-full rounded-xl my-6 shadow-sm aspect-video bg-black" src="${encodeURI(src)}">`;
      }

      return `<video controls preload="metadata" playsinline class="w-full rounded-xl my-6 shadow-sm aspect-video bg-black">`;
    }

    if (tagLower === 'source') {
      const srcMatch = rawAttrs.match(/src=(["'])(.*?)\1/i) || rawAttrs.match(/src=([^\s>]+)/i);
      const typeMatch = rawAttrs.match(/type=(["'])(.*?)\1/i) || rawAttrs.match(/type=([^\s>]+)/i);
      const src = srcMatch ? (srcMatch[2] || srcMatch[1]).trim() : '';
      const type = typeMatch ? (typeMatch[2] || typeMatch[1]).trim() : 'video/mp4';

      if (!src || !src.startsWith(validCloudinaryPrefix)) {
        return '';
      }

      return `<source src="${encodeURI(src)}" type="${type}" />`;
    }

    if (tagLower === 'figure') {
      return '<figure class="my-6">';
    }

    if (tagLower === 'figcaption') {
      return '<figcaption class="text-xs text-center text-slate-500 mt-2 italic">';
    }

    return `<${tagLower}>`;
  });

  return sanitized.trim();
}
