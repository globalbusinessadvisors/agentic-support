<div align="center">

# 🤖 Agentic Support System

<p align="center">
  <strong>Intelligent Email-to-GitHub Support Platform with Autonomous AI Agents</strong>
</p>

<p align="center">
  <a href="https://github.com/yourusername/agentic-support/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/yourusername/agentic-support/ci.yml?branch=main&style=flat-square&logo=github&label=CI" alt="CI Status">
  </a>
  <a href="https://github.com/yourusername/agentic-support/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License">
  </a>
  <a href="https://github.com/yourusername/agentic-support/releases">
    <img src="https://img.shields.io/github/v/release/yourusername/agentic-support?style=flat-square&logo=github" alt="GitHub release">
  </a>
  <a href="https://nodejs.org">
    <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square&logo=node.js" alt="Node Version">
  </a>
  <a href="https://www.typescriptlang.org/">
    <img src="https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript" alt="TypeScript">
  </a>
  <a href="https://github.com/yourusername/agentic-support/issues">
    <img src="https://img.shields.io/github/issues/yourusername/agentic-support?style=flat-square" alt="Issues">
  </a>
  <a href="https://github.com/yourusername/agentic-support/pulls">
    <img src="https://img.shields.io/github/issues-pr/yourusername/agentic-support?style=flat-square" alt="Pull Requests">
  </a>
  <a href="https://github.com/yourusername/agentic-support/stargazers">
    <img src="https://img.shields.io/github/stars/yourusername/agentic-support?style=flat-square" alt="Stars">
  </a>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-deployment">Deployment</a> •
  <a href="#-documentation">Docs</a> •
  <a href="#-contributing">Contributing</a>
</p>

<hr>

<p align="center">
  <strong>Transform your customer support with AI-powered automation</strong><br>
  Seamlessly bridge email support with GitHub Issues, powered by <a href="https://github.com/ruvnet/QuDAG">Reuven Cohen's QuDAG</a> autonomous agent system<br>
  for intelligent triage, summarization, and automated responses.
</p>

</div>

## 🌟 Features

### Core Support Infrastructure
- **📧 Email-to-GitHub Bridge**: Public support form creates GitHub issues automatically
- **✉️ Smart Reply Aliases**: Reply-to addresses like `support+issue-123@domain.com` 
- **🔄 Bidirectional Sync**: Gmail replies become GitHub comments and vice versa
- **🧵 Email Threading**: Proper In-Reply-To/References headers maintain conversation context
- **🛡️ Anti-Spam Protection**: Rate limiting and loop prevention built-in

### QuDAG/QuDAGG Agent System
- **🧠 Autonomous Triage**: Intelligent categorization and prioritization
- **📊 Intent Detection**: Understands customer needs automatically
- **📝 Smart Summarization**: Concise issue summaries for quick understanding
- **💬 Auto-Reply Engine**: High-confidence responses with human oversight
- **🎯 Confidence Scoring**: Configurable thresholds for automation vs escalation
- **🔀 DAG Processing**: Question decomposition and parallel agent execution

### Technical Excellence
- **🚀 TypeScript**: Full type safety and modern ES2022 features
- **💾 SQLite Storage**: Message deduplication and mapping persistence
- **🔐 OAuth2 Security**: Secure Gmail integration with refresh tokens
- **📊 Comprehensive Logging**: Winston-based structured logging
- **🐳 Docker Ready**: Complete containerization support
- **⚡ PM2 Integration**: Production-ready process management

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Public Form   │────▶│  Express API    │────▶│  GitHub Issues  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │                          │
                               ▼                          ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │  QuDAG Agents   │     │  Email Service  │
                        └─────────────────┘     └─────────────────┘
                               │                          │
                               ▼                          ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │    SQLite DB    │◀───▶│   Gmail IMAP    │
                        └─────────────────┘     └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- GitHub account with personal access token
- Gmail account with OAuth2 credentials
- Ubuntu/Debian (for production deployment)

### Installation

1. **Clone and setup:**
```bash
git clone https://github.com/yourusername/agentic-support.git
cd agentic-support
npm run setup
```

2. **Configure environment:**
```bash
# Edit .env file with your credentials
nano .env
```

Required configuration:
- `GITHUB_TOKEN`: GitHub personal access token with repo scope
- `GITHUB_OWNER`: Your GitHub username/organization
- `GITHUB_REPO`: Repository name for issues
- `GMAIL_CLIENT_ID`: OAuth2 client ID from Google Cloud Console
- `GMAIL_CLIENT_SECRET`: OAuth2 client secret
- `GMAIL_REFRESH_TOKEN`: OAuth2 refresh token
- `SUPPORT_EMAIL`: Your support email address

3. **Build and run:**
```bash
# Development
npm run dev

# Production
npm run build
npm start

# With PM2
npm run pm2:start
```

## 📝 Gmail OAuth2 Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Gmail API
4. Create OAuth2 credentials (Desktop application type)
5. Use the OAuth Playground to get refresh token:
   - Visit https://developers.google.com/oauthplayground/
   - Configure OAuth2 settings with your client ID/secret
   - Authorize Gmail API scope: `https://mail.google.com/`
   - Exchange authorization code for tokens
   - Copy the refresh token to your `.env` file

## 🐙 GitHub Configuration

1. Create a personal access token:
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Generate new token with `repo` scope
   - Copy token to `GITHUB_TOKEN` in `.env`

2. Set up webhook (optional but recommended):
   - Go to your repository settings → Webhooks
   - Add webhook URL: `http://your-server:3000/api/webhooks/github`
   - Content type: `application/json`
   - Secret: Set and add to `GITHUB_WEBHOOK_SECRET` in `.env`
   - Events: Issues, Issue comments

## 🤖 Agent Configuration

The QuDAG/QuDAGG system can be fine-tuned via environment variables:

```env
# Confidence threshold (0.0 - 1.0)
CONFIDENCE_THRESHOLD=0.8

# Enable/disable auto-replies
AUTO_REPLY_ENABLED=true

# Require human review for all actions
HUMAN_REVIEW_REQUIRED=true

# Optional: LLM API keys for enhanced intelligence
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### Agent Types
- **TriageAgent**: Categorizes and prioritizes requests
- **SummarizationAgent**: Creates concise summaries
- **IntentDetectionAgent**: Identifies user intentions
- **AutoReplyAgent**: Generates automated responses

### Confidence Levels
- `> 0.8`: High confidence - auto-execute
- `0.6 - 0.8`: Medium - suggest with review
- `< 0.6`: Low - escalate to human

## 🚢 Deployment

### Ubuntu with PM2

```bash
# Run deployment script
chmod +x deploy.sh
./deploy.sh --systemd

# Monitor
pm2 monit
pm2 logs
```

### Docker

```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### GitHub Actions CI/CD

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - run: npm test
      # Add deployment steps
```

## 🧪 Testing

```bash
# Run tests
npm test

# With coverage
npm run test:coverage

# Type checking
npm run typecheck

# Linting
npm run lint
```

### Test Support Flow

1. **Submit support request:**
```bash
curl -X POST http://localhost:3000/api/support/create \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "subject": "Help with feature X",
    "message": "I need assistance with...",
    "name": "John Doe"
  }'
```

2. **Check email polling:**
```bash
curl http://localhost:3000/api/email/status
```

3. **Review pending actions:**
```bash
curl http://localhost:3000/api/admin/pending-actions
```

## 📊 Monitoring

### Application Logs
- `logs/app.log`: Main application logs
- `logs/gmail.log`: Email service logs
- `logs/github.log`: GitHub integration logs
- `logs/qudag-swarm.log`: Agent system logs
- `logs/orchestrator.log`: QuDAG orchestration logs

### PM2 Monitoring
```bash
pm2 status        # Process status
pm2 monit         # Real-time monitoring
pm2 logs          # View logs
pm2 web           # Web dashboard
```

### Health Check
```bash
curl http://localhost:3000/api/health
```

## 🔒 Security Considerations

- Store credentials in environment variables only
- Use HTTPS in production
- Implement IP whitelisting for admin endpoints
- Regular security updates: `npm audit fix`
- Rotate OAuth2 tokens periodically
- Enable GitHub webhook signature verification
- Use rate limiting to prevent abuse

## 🛠️ Troubleshooting

### Common Issues

**Gmail authentication fails:**
- Verify OAuth2 credentials are correct
- Check refresh token hasn't expired
- Ensure Gmail API is enabled in Google Cloud Console

**GitHub webhook not working:**
- Verify webhook secret matches configuration
- Check server is accessible from internet
- Review GitHub webhook delivery logs

**Agents not processing:**
- Check confidence threshold settings
- Review agent logs for errors
- Verify QuDAG integration is initialized

**Database errors:**
- Ensure write permissions for data directory
- Check disk space availability
- Run database migrations if needed

## 📚 API Documentation

### POST /api/support/create
Create a new support ticket.

**Request:**
```json
{
  "email": "user@example.com",
  "subject": "Issue title",
  "message": "Detailed description",
  "name": "User Name"
}
```

**Response:**
```json
{
  "success": true,
  "issueNumber": 123,
  "issueUrl": "https://github.com/owner/repo/issues/123",
  "trackingEmail": "support+issue-123@domain.com"
}
```

### GET /api/health
System health check.

### GET /api/admin/pending-actions
List agent actions awaiting human review.

### POST /api/admin/approve-action/:id
Approve or reject an agent action.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push branch: `git push origin feature/amazing`
5. Open pull request

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2025 Global Business Advisors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction...
```

## 🙏 Acknowledgments

- [Reuven Cohen's QuDAG](https://github.com/ruvnet/QuDAG) - Quantum-resistant DAG infrastructure
- Express.js community
- Octokit for GitHub integration
- Nodemailer and ImapFlow teams

## 📞 Support

For issues or questions:
- Open an issue on GitHub
- Documentation: [Wiki](https://github.com/yourusername/agentic-support/wiki)

---

Built with ❤️ for intelligent support automation
