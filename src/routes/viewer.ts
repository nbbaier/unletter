import type { worker } from "../../alchemy.run.ts";
import { cssTokens, fontStack, googleFontsUrl } from "../lib/tokens.ts";
import type { StoredEmail } from "../types.ts";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export async function handleWebView(
  env: typeof worker.Env,
  feedId: string,
  emailId: string
): Promise<Response> {
  try {
    // Get email
    const emailData = await env.DATA.get(`email:${emailId}`);
    if (!emailData) {
      return new Response("Email not found", { status: 404 });
    }

    const email: StoredEmail = JSON.parse(emailData);

    // Verify email belongs to this feed
    if (email.feedId !== feedId) {
      return new Response("Email not found", { status: 404 });
    }

    // Format date
    const date = new Date(email.timestamp).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Build HTML page
    const appBaseUrl = trimTrailingSlash(env.APP_BASE_URL);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(email.subject)}</title>
	<style>
		${cssTokens}
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: ${fontStack.sans};
			background: var(--paper);
			color: var(--ink);
			line-height: 1.6;
		}
		.header {
			max-width: 800px;
			margin: 0 auto;
			padding: 2rem 1rem;
			border-bottom: 1px solid var(--border);
		}
		.header h1 {
			font-family: ${fontStack.serif};
			font-size: 1.75rem;
			font-weight: 600;
			margin-bottom: 0.5rem;
		}
		.meta {
			color: var(--muted);
			font-size: 0.875rem;
		}
		.meta a {
			color: var(--accent);
			text-decoration: none;
		}
		.meta a:hover {
			text-decoration: underline;
		}
		.content {
			max-width: 800px;
			margin: 0 auto;
			padding: 2rem 1rem;
		}
		.content img {
			max-width: 100%;
			height: auto;
		}
		.footer {
			max-width: 800px;
			margin: 0 auto;
			padding: 2rem 1rem;
			border-top: 1px solid var(--border);
			text-align: center;
			color: var(--muted);
			font-size: 0.875rem;
		}
		.footer a {
			color: var(--accent);
			text-decoration: none;
		}
	</style>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
	<link href="${googleFontsUrl}" rel="stylesheet">
</head>
<body>
	<header class="header">
		<h1>${escapeHtml(email.subject)}</h1>
		<p class="meta">
			From: ${escapeHtml(email.from.name || email.from.email)}<br>
			${date}
			${email.webViewLink ? `<br><a href="${escapeHtml(email.webViewLink)}" target="_blank" rel="noopener">View original</a>` : ""}
		</p>
	</header>
	<main class="content">
		${email.html || `<pre>${escapeHtml(email.text)}</pre>`}
	</main>
	<footer class="footer">
		<p>Delivered by <a href="${appBaseUrl}">unletter</a></p>
	</footer>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=3600",
        // CSP to mitigate XSS from newsletter HTML content
        "content-security-policy":
          "default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src * data:; frame-src 'none';",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "strict-origin-when-cross-origin",
      },
    });
  } catch (error) {
    console.error("Web view error:", error);
    return new Response("Error loading email", { status: 500 });
  }
}
