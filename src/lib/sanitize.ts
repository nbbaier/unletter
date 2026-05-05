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
const TAG_WHITESPACE = /\s/;
const TRAILING_SLASH = /\/$/;
const ATTRIBUTE_PATTERN =
  /([a-zA-Z-:]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
const SCRIPT_TAG_PATTERN = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i;
const INLINE_STYLE_PATTERN = /style\s*=\s*["'][^"']*["']/i;

interface ParsedTag {
  attributes: string;
  isClosing: boolean;
  isSelfClosing: boolean;
  tagName: string;
}

interface ParsedAttribute {
  name: string;
  value: string;
}

/**
 * Sanitize a URL attribute value
 */
function sanitizeUrl(url: string): string | null {
  if (!url) {
    return null;
  }

  // Trim whitespace
  const trimmedUrl = url.trim();

  // Block dangerous protocols
  if (DANGEROUS_PROTOCOLS.test(trimmedUrl)) {
    return null;
  }

  // Allow relative URLs, http, https, mailto, tel
  if (
    trimmedUrl.startsWith("//") ||
    trimmedUrl.startsWith("http://") ||
    trimmedUrl.startsWith("https://") ||
    trimmedUrl.startsWith("mailto:") ||
    trimmedUrl.startsWith("tel:") ||
    trimmedUrl.startsWith("/") ||
    trimmedUrl.startsWith("#") ||
    !trimmedUrl.includes(":")
  ) {
    return trimmedUrl;
  }

  return null;
}

function stripTrailingSlash(value: string): string {
  return value.replace(TRAILING_SLASH, "");
}

function parseTagAt(
  html: string,
  tagStart: number
): { nextIndex: number; tag: ParsedTag } | null {
  const tagEnd = html.indexOf(">", tagStart);
  if (tagEnd === -1) {
    return null;
  }

  const tagContent = html.slice(tagStart + 1, tagEnd);
  const isClosing = tagContent.startsWith("/");
  const isSelfClosing = tagContent.endsWith("/") || html[tagEnd - 1] === "/";
  const { tagName, attributes } = extractTagNameAndAttributes(
    tagContent,
    isClosing
  );

  return {
    tag: {
      tagName,
      attributes,
      isClosing,
      isSelfClosing,
    },
    nextIndex: tagEnd + 1,
  };
}

function extractTagNameAndAttributes(
  tagContent: string,
  isClosing: boolean
): { attributes: string; tagName: string } {
  if (isClosing) {
    return {
      tagName: tagContent.slice(1).split(TAG_WHITESPACE)[0].toLowerCase(),
      attributes: "",
    };
  }

  const spaceIndex = tagContent.search(TAG_WHITESPACE);
  if (spaceIndex === -1) {
    return {
      tagName: stripTrailingSlash(tagContent).toLowerCase(),
      attributes: "",
    };
  }

  return {
    tagName: tagContent.slice(0, spaceIndex).toLowerCase(),
    attributes: stripTrailingSlash(tagContent.slice(spaceIndex + 1)).trim(),
  };
}

function maybeSkipBlockedTagContent(
  lowerHtml: string,
  tag: ParsedTag,
  searchStart: number
): number | null {
  if (tag.isClosing || (tag.tagName !== "script" && tag.tagName !== "style")) {
    return null;
  }

  const endTag = `</${tag.tagName}>`;
  const endIndex = lowerHtml.indexOf(endTag, searchStart);
  if (endIndex === -1) {
    return null;
  }

  return endIndex + endTag.length;
}

function closeAllowedTag(
  result: string,
  tagStack: string[],
  tagName: string
): string {
  if (!ALLOWED_TAGS.has(tagName) || tagStack.length === 0) {
    return result;
  }

  const stackIndex = tagStack.lastIndexOf(tagName);
  if (stackIndex === -1) {
    return result;
  }

  tagStack.splice(stackIndex, 1);
  return `${result}</${tagName}>`;
}

function openAllowedTag(
  result: string,
  tagStack: string[],
  tagName: string,
  attributes: string,
  isSelfClosing: boolean
): string {
  const sanitizedAttrs = sanitizeAttributes(tagName, attributes);
  if (isSelfClosing) {
    return `${result}<${tagName}${sanitizedAttrs} />`;
  }

  tagStack.push(tagName);
  return `${result}<${tagName}${sanitizedAttrs}>`;
}

function appendParsedTag(
  result: string,
  tagStack: string[],
  tag: ParsedTag
): string {
  if (tag.isClosing) {
    return closeAllowedTag(result, tagStack, tag.tagName);
  }

  if (!ALLOWED_TAGS.has(tag.tagName)) {
    return result;
  }

  return openAllowedTag(
    result,
    tagStack,
    tag.tagName,
    tag.attributes,
    tag.isSelfClosing
  );
}

function closeRemainingTags(result: string, tagStack: string[]): string {
  let output = result;

  while (tagStack.length > 0) {
    const tag = tagStack.pop();
    if (tag) {
      output += `</${tag}>`;
    }
  }

  return output;
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
  let index = 0;
  const tagStack: string[] = [];
  const lowerHtml = html.toLowerCase();

  while (index < html.length) {
    const tagStart = html.indexOf("<", index);
    if (tagStart === -1) {
      result += escapeHtml(html.slice(index));
      break;
    }

    if (tagStart > index) {
      result += escapeHtml(html.slice(index, tagStart));
    }

    const parsedTag = parseTagAt(html, tagStart);
    if (!parsedTag) {
      break;
    }

    const skipToIndex = maybeSkipBlockedTagContent(
      lowerHtml,
      parsedTag.tag,
      parsedTag.nextIndex
    );
    if (skipToIndex !== null) {
      index = skipToIndex;
      continue;
    }

    result = appendParsedTag(result, tagStack, parsedTag.tag);
    index = parsedTag.nextIndex;
  }

  return closeRemainingTags(result, tagStack);
}

/**
 * Sanitize attributes for a given tag
 */
function sanitizeAttributes(tagName: string, attributes: string): string {
  if (!attributes) {
    return "";
  }

  const allowedAttrs = getAllowedAttributes(tagName);
  const parsedAttributes = parseAttributes(attributes);

  const result: string[] = [];
  for (const attribute of parsedAttributes) {
    result.push(sanitizeAttribute(tagName, allowedAttrs, attribute));
  }

  return result.join("");
}

function getAllowedAttributes(tagName: string): Set<string> {
  return new Set([
    ...(ALLOWED_ATTRIBUTES["*"] || []),
    ...(ALLOWED_ATTRIBUTES[tagName] || []),
  ]);
}

function parseAttributes(attributes: string): ParsedAttribute[] {
  ATTRIBUTE_PATTERN.lastIndex = 0;
  const parsed: ParsedAttribute[] = [];

  for (
    let match = ATTRIBUTE_PATTERN.exec(attributes);
    match !== null;
    match = ATTRIBUTE_PATTERN.exec(attributes)
  ) {
    parsed.push({
      name: match[1].toLowerCase(),
      value: match[2] ?? match[3] ?? match[4] ?? "",
    });
  }

  return parsed;
}

function sanitizeAttribute(
  tagName: string,
  allowedAttrs: Set<string>,
  attribute: ParsedAttribute
): string {
  if (!allowedAttrs.has(attribute.name)) {
    return "";
  }

  if (attribute.name === "href" || attribute.name === "src") {
    return sanitizeUrlAttribute(tagName, attribute.name, attribute.value);
  }

  return ` ${attribute.name}="${escapeHtml(attribute.value)}"`;
}

function sanitizeUrlAttribute(
  tagName: string,
  attributeName: string,
  attributeValue: string
): string {
  const sanitizedUrl = sanitizeUrl(attributeValue);
  if (!sanitizedUrl) {
    return "";
  }

  if (tagName === "a" && attributeName === "href") {
    return ` ${attributeName}="${escapeHtml(sanitizedUrl)}" target="_blank" rel="noopener noreferrer"`;
  }

  return ` ${attributeName}="${escapeHtml(sanitizedUrl)}"`;
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
  const hasScript = SCRIPT_TAG_PATTERN.test(html);
  const hasInlineStyle = INLINE_STYLE_PATTERN.test(html);

  const sanitizedHtml = sanitizeHtml(html);

  return {
    sanitizedHtml,
    hasScript,
    hasInlineStyle,
  };
}
