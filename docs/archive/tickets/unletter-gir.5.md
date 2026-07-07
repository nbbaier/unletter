---
id: unletter-gir.5
status: closed
deps: [unletter-gir.1, unletter-gir.2]
links: []
created: 2025-12-15T14:03:55.743657-06:00
type: task
priority: 1
parent: unletter-gir
---
# Webhook Endpoint

Implement POST /api/webhook/inbound to receive inbound.new webhooks. Verify signature, parse email, extract feed ID from recipient, store in KV.


