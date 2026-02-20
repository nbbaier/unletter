/**
 * HTML Sanitization for Email Content
 *
 * Protects against XSS attacks by sanitizing HTML before storage.
 * Uses a whitelist approach - only allows safe tags and attributes.
 */

// Allowed HTML tags for email content
const ALLOWED_TAGS = new Set([
  // Text formatting
  "p",
  "br",
  "hr",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "strike",
  "del",
  "s",
  "sub",
  "sup",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "q",
  "cite",
  "pre",
  "code",

  // Lists
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",

  // Tables
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "caption",
  "colgroup",
  "col",

  // Media
  "img",
  "figure",
  "figcaption",
  "a",

  // Layout
  "div",
  "span",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "aside",
  "nav",

  // Other
  "abbr",
  "acronym",
  "address",
  "bdo",
  "big",
  "center",
  "dfn",
  "font",
  "ins",
  "kbd",
  "mark",
  "samp",
  "small",
  "time",
  "tt",
  "var",
  "wbr",
]);

// Allowed attributes for specific tags
const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  "*": new Set(["title", "dir", "lang", "class", "id"]),
  a: new Set(["href", "target", "rel", "title"]),
  img: new Set(["src", "alt", "title", "width", "height", "loading"]),
  table: new Set(["border", "cellpadding", "cellspacing", "width"]),
  td: new Set(["colspan", "rowspan", "width", "align", "valign"]),
  th: new Set(["colspan", "rowspan", "width", "align", "valign"]),
};

// Dangerous URL schemes to block
const DANGEROUS_PROTOCOLS = /^(javascript|data|vbscript|file):/i;

/**
 * Sanitize a URL attribute value
 */
function sanitizeUrl(url: string): string | null {
  if (!url) {
    return null;
  }

  // Trim whitespace
  url = url.trim();

  // Block dangerous protocols
  if (DANGEROUS_PROTOCOLS.test(url)) {
    return null;
  }

  // Allow relative URLs, http, https, mailto, tel
  if (
    url.startsWith("//") ||
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("mailto:") ||
    url.startsWith("tel:") ||
    url.startsWith("/") ||
    url.startsWith("#") ||
    !url.includes(":")
  ) {
    return url;
  }

  return null;
}

/**
 * Parse and sanitize HTML string
 * Returns sanitized HTML with only allowed tags and attributes
 */
export function sanitizeHtml(html: string): string {
  if (!html) {
    return "";
  }

  // Use a simple regex-based parser for Cloudflare Workers
  // (no DOMParser available in Workers)
  return parseAndSanitize(html);
}

/**
 * Simple HTML parser and sanitizer
 * Processes tag by tag and only keeps allowed content
 */
function parseAndSanitize(html: string): string {
  let result = "";
  let i = 0;
  const tagStack: string[] = [];

  while (i < html.length) {
    const char = html[i];

    if (char === "<") {
      // Parse tag
      const tagEnd = html.indexOf(">", i);
      if (tagEnd === -1) {
        // Malformed HTML, break
        break;
      }

      const tagContent = html.slice(i + 1, tagEnd);
      const isClosing = tagContent.startsWith("/");
      const isSelfClosing =
        tagContent.endsWith("/") || html.slice(tagEnd - 1, tagEnd + 1) === "/>";

      // Extract tag name and attributes
      let tagName: string;
      let attributes: string;

      if (isClosing) {
        tagName = tagContent.slice(1).split(/\s/)[0].toLowerCase();
        attributes = "";
      } else {
        const spaceIndex = tagContent.search(/\s/);
        if (spaceIndex === -1) {
          tagName = tagContent.replace(/\/$/, "").toLowerCase();
          attributes = "";
        } else {
          tagName = tagContent.slice(0, spaceIndex).toLowerCase();
          attributes = tagContent
            .slice(spaceIndex + 1)
            .replace(/\/$/, "")
            .trim();
        }
      }

      // Handle the tag
      if (isClosing) {
        // Check if this is a tag we kept
        if (ALLOWED_TAGS.has(tagName) && tagStack.length > 0) {
          // Pop matching tag or closest allowed parent
          const stackIndex = tagStack.lastIndexOf(tagName);
          if (stackIndex !== -1) {
            tagStack.splice(stackIndex, 1);
            result += `</${tagName}>`;
          }
        }
      } else if (ALLOWED_TAGS.has(tagName)) {
        // Sanitize attributes
        const sanitizedAttrs = sanitizeAttributes(tagName, attributes);

        if (isSelfClosing) {
          result += `<${tagName}${sanitizedAttrs} />`;
        } else {
          result += `<${tagName}${sanitizedAttrs}>`;
          tagStack.push(tagName);
        }
      } else if (tagName === "script" || tagName === "style") {
        // Skip content of script and style tags entirely
        const endTag = `</${tagName}>`;
        const endIndex = html.toLowerCase().indexOf(endTag, tagEnd);
        if (endIndex !== -1) {
          i = endIndex + endTag.length;
          continue;
        }
      }
      // Skip disallowed tags (don't add to result)

      i = tagEnd + 1;
    } else {
      // Regular text content - escape it
      result += escapeHtml(char);
      i++;
    }
  }

  // Close any remaining open tags
  while (tagStack.length > 0) {
    const tag = tagStack.pop();
    if (tag) {
      result += `</${tag}>`;
    }
  }

  return result;
}

/**
 * Sanitize attributes for a given tag
 */
function sanitizeAttributes(tagName: string, attributes: string): string {
  if (!attributes) {
    return "";
  }

  const allowedAttrs = new Set([
    ...(ALLOWED_ATTRIBUTES["*"] || []),
    ...(ALLOWED_ATTRIBUTES[tagName] || []),
  ]);

  let result = "";
  const attrRegex =
    /([a-zA-Z-:]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

  for (
    let match = attrRegex.exec(attributes);
    match !== null;
    match = attrRegex.exec(attributes)
  ) {
    const attrName = match[1].toLowerCase();
    const attrValue = match[2] ?? match[3] ?? match[4] ?? "";

    if (allowedAttrs.has(attrName)) {
      // Special handling for URL attributes
      if (attrName === "href" || attrName === "src") {
        const sanitizedUrl = sanitizeUrl(attrValue);
        if (sanitizedUrl) {
          // Add security attributes for links
          if (tagName === "a" && attrName === "href") {
            result += ` ${attrName}="${escapeHtml(sanitizedUrl)}" target="_blank" rel="noopener noreferrer`;
          } else {
            result += ` ${attrName}="${escapeHtml(sanitizedUrl)}"`;
          }
        }
      } else {
        result += ` ${attrName}="${escapeHtml(attrValue)}"`;
      }
    }
  }

  return result;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Additional security: Add CSP-friendly wrapper
 * This ensures even if sanitization misses something, CSP can help
 */
export function sanitizeEmailContent(html: string): {
  sanitizedHtml: string;
  hasScript: boolean;
  hasInlineStyle: boolean;
} {
  const hasScript = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi.test(
    html
  );
  const hasInlineStyle = /style\s*=\s*["'][^"']*["']/gi.test(html);

  const sanitizedHtml = sanitizeHtml(html);

  return {
    sanitizedHtml,
    hasScript,
    hasInlineStyle,
  };
}
