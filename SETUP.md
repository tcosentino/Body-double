# CI & Development Setup Guide

This guide explains how to configure the GitHub Actions CI pipeline and set up your development environment for the Body Double project.

## Quick Start

1. Add your `ANTHROPIC_API_KEY` secret to GitHub (see below)
2. Create a PR - CI will run automatically
3. Check the PR comment for results
4. Download artifacts for chat demo output

---

## GitHub Secrets Configuration

### Required Secrets

Go to: **Repository → Settings → Secrets and variables → Actions → New repository secret**

| Secret Name         | Description                                       | Required            |
| ------------------- | ------------------------------------------------- | ------------------- |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (starts with `sk-ant-...`) | Yes, for chat demos |
| `HELICONE_API_KEY`  | Helicone API key for LLM observability            | No, optional        |

### How to Get an Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in
3. Navigate to **API Keys**
4. Click **Create Key**
5. Copy the key (starts with `sk-ant-...`)
6. Add it as `ANTHROPIC_API_KEY` secret in GitHub

---

## What the CI Does

### On Every Push/PR

| Job           | Purpose                               | Duration |
| ------------- | ------------------------------------- | -------- |
| `test`        | Run tests, lint, typecheck on Node 20 | ~2 min   |
| `test-node18` | Verify Node 18 compatibility          | ~1 min   |
| `auto-format` | Auto-fix formatting issues (PRs only) | ~1 min   |

### PR Comments

Every PR gets an auto-updating comment showing:

```
## CI Results

| Check | Status |
|-------|--------|
| Tests | ✅ success |
| Lint | ✅ success |
| TypeCheck | ✅ success |

<details>
<summary>🤖 Chat Demo Preview</summary>
[Sample conversation output...]
</details>
```

### Artifacts

Download from the **Actions** tab → Select a run → **Artifacts** section:

| Artifact    | Contents                                                |
| ----------- | ------------------------------------------------------- |
| `ci-output` | `chat-output.txt`, `test-output.txt`, `lint-output.txt` |

---

## Local Development

### Prerequisites

- Node.js 18.x or 20.x
- npm

### Setup

```bash
# Clone the repository
git clone https://github.com/tcosentino/Body-double.git
cd Body-double

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### Available Scripts

```bash
# Development
npm run dev           # Start dev server with hot reload
npm run build         # Type check with TypeScript

# Testing
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report

# Code Quality
npm run lint          # Check for linting issues
npm run lint:fix      # Auto-fix linting issues
npm run format        # Format all files with Prettier
npm run format:check  # Check formatting without fixing

# Demos
npm run demo:chat     # Run sample chat conversations
npm run test:prompts  # Interactive prompt testing
```

### Environment Variables

Create a `.env` file in the project root:

```env
# Required for AI features
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Optional - Helicone observability (https://helicone.ai)
HELICONE_API_KEY=sk-helicone-your-key-here

# Optional
NODE_ENV=development
PORT=3000
```

### Helicone Setup (Optional)

[Helicone](https://helicone.ai) provides LLM observability with:

- Request/response logging
- Cost tracking per user/session
- Latency metrics
- 50K free logs/month

To enable:

1. Sign up at [helicone.ai](https://helicone.ai)
2. Get your API key from the dashboard
3. Add `HELICONE_API_KEY` to your environment

The app includes deep links to Helicone filtered by session - click "API Logs" in the session header to view requests for that session.

---

## Mobile/iPad Workflow

This CI is optimized for reviewing PRs on mobile devices:

### Workflow

1. **Develop** → Use Claude Code to make changes
2. **Push** → Changes go to a feature branch
3. **Review on Mobile** → Open GitHub, see PR comment with results
4. **Merge** → If tests pass, merge from mobile
5. **Auto-format** → CI commits formatting fixes automatically

### Tips for Mobile

- **PR Comments** show test results in a readable table format
- **Expandable sections** keep the comment compact
- **Auto-format** means you don't need to fix formatting manually
- **Artifacts** can be downloaded and viewed later

---

## Troubleshooting

### Tests Failing

1. Check the PR comment for the error summary
2. Download `test-output.txt` from artifacts for full output
3. Run locally: `npm test`

### Lint Errors

- The `auto-format` job will fix most issues automatically
- For remaining issues, run `npm run lint:fix` locally

### Chat Demo Not Running

- Verify `ANTHROPIC_API_KEY` secret is set in GitHub
- Check that the key is valid and has credits
- The demo gracefully skips if no key is configured

### Node 18 vs 20 Failures

- Ensure you're using `import crypto from "node:crypto"` (not global `crypto`)
- Both versions should pass - if only one fails, check for version-specific APIs

---

## Branch Protection (Recommended)

Go to: **Repository → Settings → Branches → Add rule**

Recommended settings for `main`:

- ✅ Require a pull request before merging
- ✅ Require status checks to pass before merging
  - Select: `test`, `test-node18`
- ✅ Require branches to be up to date before merging

---

## Adding Preview Deployments (Optional)

To test the app on mobile, add a preview deployment service:

### Vercel

1. Connect your repo at [vercel.com](https://vercel.com)
2. Add secrets to GitHub:
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`
3. Add deployment step to workflow (see Vercel docs)

### Netlify

1. Connect your repo at [netlify.com](https://netlify.com)
2. Enable automatic deploy previews
3. Preview URLs appear as PR comments automatically

---

## File Structure

```
.github/
  workflows/
    test.yml          # Main CI workflow
.eslintrc.json        # ESLint configuration
.prettierrc           # Prettier configuration
.prettierignore       # Files to skip formatting
package.json          # Scripts and dependencies
SETUP.md              # This file
```
