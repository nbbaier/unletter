import { describe, expect, it } from "vitest";
import { sanitizeEmailContent, sanitizeHtml } from "../lib/sanitize.ts";

describe("sanitizeHtml", () => {
  it("should allow safe HTML tags", () => {
    const html = "<p>Hello <strong>world</strong></p>";
    const result = sanitizeHtml(html);
    expect(result).toContain("<p>");
    expect(result).toContain("<strong>");
    expect(result).toContain("world");
  });

  it("should remove script tags", () => {
    const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
    expect(result).toContain("<p>");
  });

  it("should remove dangerous attributes", () => {
    const html = '<a href="javascript:alert(1)">click me</a>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("alert");
  });

  it("should allow safe URLs", () => {
    const html = '<a href="https://example.com">link</a>';
    const result = sanitizeHtml(html);
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer');
  });

  it("should block data URLs", () => {
    const html = '<a href="data:text/html,<script>alert(1)</script>">link</a>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("data:");
  });

  it("should handle malformed HTML gracefully", () => {
    const html = "<p>Unclosed paragraph";
    const result = sanitizeHtml(html);
    expect(result).toContain("<p>");
    expect(result).toContain("Unclosed paragraph");
  });

  it("should handle text content within tags", () => {
    const html = "<p>Hello World</p>";
    const result = sanitizeHtml(html);
    expect(result).toContain("Hello World");
    expect(result).toContain("<p>");
  });

  it("should preserve allowed table attributes", () => {
    const html =
      '<table border="1" width="100%"><tr><td>Cell</td></tr></table>';
    const result = sanitizeHtml(html);
    expect(result).toContain('border="1"');
    expect(result).toContain('width="100%"');
    expect(result).toContain("<table");
    expect(result).toContain("</table>");
  });

  it("should remove style tags and content", () => {
    const html = "<style>body { color: red; }</style><p>Hello</p>";
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<style>");
    expect(result).not.toContain("color: red");
    expect(result).toContain("<p>");
  });
});

describe("sanitizeEmailContent", () => {
  it("should detect scripts in email", () => {
    const html = "<script>malicious</script><p>content</p>";
    const result = sanitizeEmailContent(html);
    expect(result.hasScript).toBe(true);
  });

  it("should detect inline styles", () => {
    const html = '<p style="color: red;">content</p>';
    const result = sanitizeEmailContent(html);
    expect(result.hasInlineStyle).toBe(true);
  });

  it("should return sanitized HTML", () => {
    const html = "<script>bad</script><p>good</p>";
    const result = sanitizeEmailContent(html);
    expect(result.sanitizedHtml).toContain("<p>");
    expect(result.sanitizedHtml).not.toContain("<script>");
  });
});
