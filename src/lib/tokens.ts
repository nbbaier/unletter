/**
 * Shared design tokens as a CSS string for server-rendered HTML templates.
 * Source of truth is src/assets/styles.css :root — keep these in sync.
 */
export const cssTokens = `
:root {
	--ink: #1a1a1a;
	--paper: #fdfbf7;
	--accent: #d84315;
	--accent-hover: #bf360c;
	--muted: #6b7280;
	--border: #e5dfd3;
	--surface: #f8f6f1;
	--on-accent: #fff;
	--success: #2d6a4f;
	--success-border: #95b8a1;
	--error: #a4161a;
	--error-border: #d4a5a5;
	--info: #1f4788;
	--info-border: #a8bfe0;
}`;

export const fontStack = {
  sans: "'Work Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  serif: "'Crimson Pro', serif",
};

export const googleFontsUrl =
  "https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600&family=Work+Sans:wght@400;500;600&display=swap";
