export interface User {
  createdAt: string;
  email: string;
  id: string;
  passwordHash: string;
}

export interface Feed {
  createdAt: string;
  emailAddress: string;
  id: string;
  name: string;
  userId: string;
}

export interface StoredEmail {
  feedId: string;
  from: {
    name: string;
    email: string;
  };
  html: string;
  id: string;
  subject: string;
  text: string;
  timestamp: string;
  webViewLink?: string;
}

export interface InboundWebhookPayload {
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
  event: string;
  timestamp: string;
}
