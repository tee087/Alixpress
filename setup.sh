#!/bin/bash

echo "🚀 Setting up Telegram Checkout Project..."

# Install dependencies
echo "Installing dependencies..."
npm install

# Set environment variables
echo "Setting up environment..."
if [ ! -f .env.local ]; then
  cat > .env.local << EOF
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
PAYMENT_PROVIDER=stripe
STRIPE_PUBLISHABLE_KEY=pk_test_demo123
ENCRYPTION_KEY=demo-encryption-key-32-characters-long
TELEGRAM_BOT_TOKEN=8910571367:AAFXmNfEUziBQmTj8Ge9auFqPy9W-0uDCL8
TELEGRAM_WEBHOOK_SECRET=webhook_secret_12345
JWT_SECRET=jwt_secret_12345
EOF
  echo "Created .env.local file"
fi

# Start the server in the background
echo "Starting API server..."
node server.js &

# Wait a moment for server to start
sleep 2

# Start the frontend
echo "Starting development server..."
vite

# To stop servers: Ctrl+C