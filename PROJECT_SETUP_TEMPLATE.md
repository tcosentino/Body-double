# Project Setup Template for Claude Code

Paste this into Claude Code for a new project to bootstrap a TypeScript Node.js project with the same development cycle.

---

## Quick Start Prompt

Copy and paste this into Claude Code:

```
Set up this project with the following development stack:

## Core Stack
- TypeScript with ES Modules (ESM)
- Node.js 20+ (with 18.x compatibility)
- Express.js for API (if needed)
- SQLite with better-sqlite3 (if database needed)

## Development Tools
- **Build**: TypeScript + tsx for development with hot reload
- **Test**: Vitest with v8 coverage
- **Lint**: ESLint with @typescript-eslint
- **Format**: Prettier

## Configuration Requirements

### package.json
- type: "module"
- scripts:
  - dev: tsx watch src/index.ts
  - build: tsc --noEmit
  - start: tsx src/index.ts
  - test: vitest run
  - test:watch: vitest
  - test:coverage: vitest run --coverage
  - lint: eslint .
  - lint:fix: eslint . --fix
  - format: prettier --write .
  - format:check: prettier --check .

### tsconfig.json
- target: ES2022
- module: NodeNext
- moduleResolution: NodeNext
- strict: true
- outDir: dist
- include: ["src"]

### ESLint (.eslintrc.json)
- Parser: @typescript-eslint/parser
- Extends: eslint:recommended, plugin:@typescript-eslint/recommended
- Allow unused vars with _ prefix
- Ignore dist/, node_modules/, *.js

### Prettier (.prettierrc)
- Semi: true
- Single quotes: false
- Tab width: 2
- Print width: 100
- Trailing comma: es5

### Vitest (vitest.config.ts)
- Test files: tests/**/*.test.ts
- Environment: node
- Globals: true
- Coverage: v8, text + html reporters
- Setup file: tests/setup.ts
- 10 second timeout

## CI/CD (GitHub Actions)

Create .github/workflows/test.yml that:
1. Runs on push to main and PRs
2. Tests on Node 20.x (primary) and 18.x (compat)
3. Runs lint, tests with coverage, and type check
4. Auto-formats code on PRs and commits changes back
5. Posts results as PR comment with status badges

## Test Infrastructure

Create tests/ directory with:
- setup.ts: Global beforeAll/afterAll hooks
- utils/test-helpers.ts: Factory functions for test data
- utils/test-app.ts: App instance for integration tests (if Express)

## File Structure

project/
├── src/
│   ├── index.ts           # Entry point
│   ├── routes/            # API routes (if needed)
│   └── services/          # Business logic
├── tests/
│   ├── setup.ts
│   ├── routes/            # Integration tests
│   ├── services/          # Unit tests
│   └── utils/
├── .github/workflows/
│   └── test.yml
├── .eslintrc.json
├── .prettierrc
├── .prettierignore
├── .gitignore
├── .env.example
├── tsconfig.json
├── vitest.config.ts
├── package.json
└── README.md

## Additional Requirements
- Create a comprehensive .gitignore (node_modules, dist, .env, coverage, *.db)
- Create .env.example with placeholder variables
- Initialize git repository
- Install all dependencies
- Run initial lint and format
- Make initial commit

Please set up all of this now.
```

---

## Customization Options

Add any of these to your prompt:

### For a web API project:
```
Also add:
- Express.js with CORS middleware
- better-sqlite3 for database
- uuid for ID generation
- API routes structure with auth middleware
```

### For WebSocket support:
```
Also add:
- ws package for WebSockets
- WebSocket route handler
```

### For external API integrations:
```
Also add:
- OAuth flow support
- API rate limiting utilities
- Token refresh handling
```

### For a CLI tool:
```
Instead of Express:
- Create a CLI entry point
- Add commander or yargs for argument parsing
- Add chalk for colored output
```

---

## Individual Config Files (for reference)

### package.json
```json
{
  "name": "your-project-name",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "build": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@vitest/coverage-v8": "^2.1.0",
    "eslint": "^9.0.0",
    "prettier": "^3.4.0",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

### .eslintrc.json
```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module"
  },
  "env": {
    "node": true,
    "es2022": true
  },
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
    "no-console": "off"
  },
  "ignorePatterns": ["dist/", "node_modules/", "*.js"]
}
```

### .prettierrc
```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "printWidth": 100,
  "trailingComma": "es5"
}
```

### .prettierignore
```
dist/
node_modules/
coverage/
```

### vitest.config.ts
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["**/*.d.ts"],
    },
    setupFiles: ["tests/setup.ts"],
    testTimeout: 10000,
  },
});
```

### .gitignore
```
node_modules/
dist/
.env
*.log
coverage/
*.db
*.sqlite
.DS_Store
```

### .env.example
```bash
# Add your environment variables here
NODE_ENV=development
PORT=3000
```

### tests/setup.ts
```typescript
import { beforeAll, afterAll, beforeEach } from "vitest";

beforeAll(async () => {
  // Global setup (e.g., database connection)
});

afterAll(async () => {
  // Global teardown
});

beforeEach(async () => {
  // Reset state between tests
});
```

### .github/workflows/test.yml
```yaml
name: Test

on:
  push:
    branches: [main, master]
  pull_request:
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20.x"
          cache: "npm"

      - run: npm ci

      - name: Lint
        run: npm run lint
        continue-on-error: true

      - name: Test
        run: npm run test:coverage

      - name: Type Check
        run: npm run build

  test-node18:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "18.x"
          cache: "npm"

      - run: npm ci
      - run: npm test

  auto-format:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.head_ref }}

      - uses: actions/setup-node@v4
        with:
          node-version: "20.x"
          cache: "npm"

      - run: npm ci
      - run: npm run lint:fix
      - run: npm run format

      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "style: auto-fix formatting"
```

---

## What This Gives You

✅ **TypeScript** with strict mode and ES modules
✅ **Hot reload** development with tsx
✅ **Comprehensive testing** with Vitest + coverage
✅ **Code quality** with ESLint + Prettier
✅ **CI/CD** with GitHub Actions (multi-Node version testing)
✅ **Auto-formatting** on PRs
✅ **Clean project structure** with tests separated

The dev cycle:
1. `npm run dev` - develop with hot reload
2. `npm test` - run tests locally
3. Push to branch - CI runs lint, tests, type check
4. PR auto-formats code if needed
5. Merge when CI passes
