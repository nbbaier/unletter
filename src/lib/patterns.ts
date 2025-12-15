// Patterns to detect "view in browser" links in newsletter emails
const LINK_TEXT_PATTERNS = [
	/view.{0,15}(in|this).{0,15}browser/i,
	/view.{0,15}online/i,
	/web.{0,15}version/i,
	/read.{0,15}(in|on).{0,15}browser/i,
	/having.{0,20}trouble.{0,20}viewing/i,
	/click.{0,15}here.{0,15}(to\s+)?view/i,
	/view.{0,15}email.{0,15}(in|on).{0,15}browser/i,
];

// Simple HTML anchor tag regex
const ANCHOR_REGEX = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;

export function extractWebViewLink(html: string): string | undefined {
	let match: RegExpExecArray | null;

	// Reset regex state
	ANCHOR_REGEX.lastIndex = 0;

	while ((match = ANCHOR_REGEX.exec(html)) !== null) {
		const href = match[1];
		const linkText = match[2];

		// Check if the link text matches any of our patterns
		for (const pattern of LINK_TEXT_PATTERNS) {
			if (pattern.test(linkText)) {
				// Basic validation that it's a real URL
				if (href.startsWith("http://") || href.startsWith("https://")) {
					return href;
				}
			}
		}
	}

	return undefined;
}
