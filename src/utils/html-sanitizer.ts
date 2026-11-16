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
