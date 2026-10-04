# Troubleshooting AI setup and responses

AI errors usually relate to access, provider configuration, model availability, billing, limits or an interrupted connection.

## The how

1. Confirm the account includes **AI Tools**.
2. Open **Account Settings → AI** and check the active provider, model and **Connected** state.
3. If the key is invalid or expired, paste a replacement and save.
4. For Google Gemini, complete the displayed billing confirmation when required.
5. Check the provider account for billing credit, usage limits, outages or model access.
6. Choose a current model from the live catalogue or enter a valid model ID.
7. Retry a small, clear request.
8. If generation is interrupted, keep the current text, use **Retry** or start again; do not replace a scene with a partial long rewrite.

📸 SCREENSHOT: Open **Account Settings → AI** with a deliberately invalid documentation key already removed. Show provider/model fields, connection status and an anonymised error message. Never expose a secret.

## The why: YOW and the provider report different failures

YOW prepares context and sends the request; the provider decides authentication, billing, model access, rate limits and safety responses. An empty or stopped response does not mean manuscript data was deleted.

Model lists change independently of YOW. A saved model can become unavailable, and a new key may belong to a provider project without required billing.

Large requests can exceed context or output limits. Narrow the context, select a passage or split the task. Copy any useful partial response before retrying.

## Related articles

- Setting up an AI provider and API key
- Understanding AI access, privacy, usage and errors
- Using AI suggestions while writing
