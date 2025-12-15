export interface User {
	id: string;
	email: string;
	passwordHash: string;
	createdAt: string;
}

export interface Feed {
	id: string;
	userId: string;
	name: string;
	emailAddress: string;
	createdAt: string;
}

export interface StoredEmail {
	id: string;
	feedId: string;
	subject: string;
	from: {
		name: string;
		email: string;
	};
	html: string;
	text: string;
	timestamp: string;
	webViewLink?: string;
}

export interface InboundWebhookPayload {
	event: string;
	timestamp: string;
	email: {
		id: string;
		from: {
			text: string;
			addresses: Array<{
				address: string;
				name?: string;
			}>;
		};
		to: {
			text: string;
			addresses: Array<{
				address: string;
			}>;
		};
		recipient: string;
		subject: string;
		receivedAt: string;
		parsedData: {
			textBody: string;
			htmlBody: string;
		};
	};
}
