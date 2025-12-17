# Body Double

[![Tests](https://github.com/tcosentino/Body-double/actions/workflows/test.yml/badge.svg)](https://github.com/tcosentino/Body-double/actions/workflows/test.yml)

AI-powered body doubling companion for focus and productivity.

## What is Body Doubling?

Body doubling is a productivity strategy where having another person present (physically or virtually) helps you stay focused on tasks. This is especially effective for people with ADHD.

This project creates an AI companion that provides that supportive presence during work sessions.

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env

# Run development server
npm run dev

# Run tests
npm test
```

## Features

- 🎯 **Focus Sessions** - Timed work sessions with check-ins
- 🤖 **AI Companion** - Warm, supportive presence that remembers your context
- 💾 **Memory** - Companion learns your projects, challenges, and preferences
- 🔐 **Magic Link Auth** - Passwordless authentication

## Development

See [SETUP.md](./SETUP.md) for detailed CI configuration and development setup.

### Scripts

```bash
npm run dev          # Start dev server
npm test             # Run tests
npm run lint         # Check code quality
npm run lint:fix     # Fix lint issues
npm run format       # Format code
npm run demo:chat    # Run sample conversations
```

## Architecture

```
src/
  server/
    routes/       # API endpoints
    services/     # Business logic (auth, companion, memory)
    middleware/   # Auth middleware
    db/           # SQLite database
tests/
  routes/         # API integration tests
  services/       # Unit tests
prompts/
  system-prompt.ts    # AI companion personality
  user-contexts.ts    # Test scenarios
```

## License

MIT
