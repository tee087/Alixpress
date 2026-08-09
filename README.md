# Telegram-Integrated Checkout Page

This project implements a checkout page with Telegram bot integration for OTP-free approvals.

## Features

- **Telegram Approval Flow**: Approve checkouts, sign-ins, and registrations via Telegram bot
- **Cart Notifications**: Receive messages when items are added to cart
- **Spinning Icon**: Shows loading animation while waiting for Telegram approval
- **Fallback OTP**: Web-based OTP entry when Telegram is not connected

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables (`.env.local`):
```bash
TELEGRAM_BOT_TOKEN=8910571367:AAFXmNfEUziBQmTj8Ge9auFqPy9W-0uDCL8
TELEGRAM_WEBHOOK_SECRET=webhook_secret_12345
JWT_SECRET=jwt_secret_12345
```

3. Start the servers:
```bash
npm run dev
```

## Telegram Bot Setup

1. Create a bot with @BotFather
2. Get your bot token
3. Set the webhook:
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "http://localhost:3001/api/telegram/webhook"}'
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/telegram-link` | POST | Initiate Telegram connection |
| `/api/auth/signin` | POST | Request sign in approval |
| `/api/auth/register` | POST | Request registration approval |
| `/api/cart/add` | POST | Add item to cart (sends notification) |
| `/api/checkouts` | POST | Create checkout request |
| `/api/checkouts/:id/approve-telegram` | POST | Approve via Telegram |
| `/api/checkouts/:id/reject-telegram` | POST | Reject via Telegram |
| `/api/telegram/webhook` | POST | Receive Telegram updates |

## Project Structure

```
├── components/
│   ├── CheckoutPage.tsx    # Main checkout page with Telegram support
│   ├── ProfilePage.tsx     # Profile page with Telegram connection
│   └── Modal.tsx          # Reusable modal component
├── lib/
│   └── api.ts             # API client helper
├── src/
│   ├── main.tsx           # React entry point
│   ├── index.html         # HTML template
│   └── index.css          # Tailwind CSS imports
├── server.js              # Express.js API server
├── package.json           # Dependencies
└── .env.local             # Environment variables
```

## Test Your Chat ID

Send `/start` to your bot. Check the server console for your chat ID to use in testing.

## Usage

1. Visit `http://localhost:3000`
2. Go to Profile page
3. Click "Connect Telegram"
4. Approve the connection
5. Proceed to Checkout
6. If Telegram connected, approval buttons appear in Telegram
7. Success page shows after approval