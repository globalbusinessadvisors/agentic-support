#!/bin/bash

# Agentic Support System Deployment Script
# For Ubuntu/Debian systems

set -e

echo "🚀 Deploying Agentic Support System..."

# Check for required tools
command -v node >/dev/null 2>&1 || { echo "Node.js is required but not installed. Aborting." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required but not installed. Aborting." >&2; exit 1; }

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --production

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Create required directories
echo "📁 Creating directories..."
mkdir -p data logs

# Set up PM2 (if not installed)
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

# Set up systemd service (optional)
if [ "$1" == "--systemd" ]; then
    echo "⚙️ Setting up systemd service..."
    pm2 startup systemd -u $USER --hp $HOME
    pm2 save
fi

# Start the application
echo "🎯 Starting application with PM2..."
pm2 start ecosystem.config.js

# Show status
pm2 status

echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "1. Copy .env.example to .env and configure your settings"
echo "2. Set up GitHub webhook to http://your-server:3000/api/webhooks/github"
echo "3. Configure Gmail OAuth2 credentials"
echo "4. Run 'pm2 logs' to view application logs"
echo "5. Run 'pm2 monit' for real-time monitoring"