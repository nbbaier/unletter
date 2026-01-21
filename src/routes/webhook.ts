import type { worker } from "../../alchemy.run.ts";
import { extractWebViewLink } from "../lib/patterns.ts";
import type { InboundWebhookPayload, StoredEmail } from "../types.ts";

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"content-type": "application/json",
			"access-control-allow-origin": "*",
		},
	});
}

export async function handleInboundWebhook(
	request: Request,
	env: typeof worker.Env,
): Promise<Response> {
	// Verify webhook signature
	const webhookToken = request.headers.get("x-webhook-verification-token");
	if (webhookToken !== env.WEBHOOK_SECRET) {
		return jsonResponse({ error: "Invalid webhook signature" }, 401);
	}

	try {
		const payload: InboundWebhookPayload = await request.json();

		// Extract feed ID from recipient address
		// Format: {feed-id}@unletter.app
		const recipient = payload.email.recipient;
		const feedId = recipient.split("@")[0];

		if (!feedId) {
			return jsonResponse({ error: "Invalid recipient address" }, 400);
		}

		// Look up feed
		const feedData = await env.DATA.get(`feed:${feedId}`);
		if (!feedData) {
			console.log(`Feed not found for recipient: ${recipient}`);
			return jsonResponse({ error: "Feed not found" }, 404);
		}

		// Extract sender info
		const fromAddress = payload.email.from.addresses[0];
		const fromName = fromAddress?.name || "";
		const fromEmail = fromAddress?.address || payload.email.from.text;

		// Extract web view link from HTML
		const webViewLink = payload.email.parsedData.htmlBody
			? extractWebViewLink(payload.email.parsedData.htmlBody)
			: undefined;

		// Create stored email
		const emailId = payload.email.id;
		const storedEmail: StoredEmail = {
			id: emailId,
			feedId,
			subject: payload.email.subject,
			from: {
				name: fromName,
				email: fromEmail,
			},
			html: payload.email.parsedData.htmlBody || "",
			text: payload.email.parsedData.textBody || "",
			timestamp: payload.email.receivedAt,
			webViewLink,
		};

		// Store email
		await env.DATA.put(`email:${emailId}`, JSON.stringify(storedEmail));

		// Update feed's email list (prepend to keep newest first)
		const emailListData = await env.DATA.get(`feed:${feedId}:emails`);
		const emailIds: string[] = emailListData ? JSON.parse(emailListData) : [];
		emailIds.unshift(emailId);
		await env.DATA.put(`feed:${feedId}:emails`, JSON.stringify(emailIds));

		console.log(`Stored email ${emailId} for feed ${feedId}`);

		return jsonResponse({ success: true, emailId });
	} catch (error) {
		console.error("Webhook processing error:", error);
		return jsonResponse({ error: "Failed to process webhook" }, 500);
	}
}
