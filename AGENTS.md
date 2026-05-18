# Repository Guidelines

This is a public repository. Everything committed here can be read by users,
reviewers, package scanners, and npm consumers. Do not add private URLs,
credentials, customer data, internal execution IDs, private runbooks, private
product docs, or operational notes from the private Batchly repository.

This repository owns the public n8n community node package
`n8n-nodes-llm-batchly`. The private `8d-inc/llm-batchly` repository remains the
source of truth for the Batchly app, backend, billing, internal operations, and
private product planning.

## Project Structure

- `credentials/` - n8n credential definition for the Batchly API key.
- `nodes/LLMBatchly/` - n8n node implementation, request parsing, API client,
  types, validation, and icon assets.
- `scripts/` - package build and metadata verification helpers.
- `tests/unit/` - Node.js unit tests for the n8n node package.
- `.github/workflows/` - public CI and npm publish workflows.

## Public Repo Rules

- Keep docs focused on the public n8n node and public Batchly API contract.
- Do not copy private monorepo docs or release notes into this repository.
- Do not include `.env`, `.npmrc`, API keys, npm tokens, screenshots with
  private data, internal URLs, n8n execution IDs, or dashboard credential names.
- If a node change depends on private backend behavior, coordinate the backend
  change in the private repository first, then update this public package.
- Publish and verified-node release work happens from this repository.

## Build, Test, and Release

Use Node.js 24 and pnpm 10.

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run test
pnpm run scan
```

Before publishing, also verify the package contents:

```bash
npm pack --dry-run
```

Release tags use this format:

```bash
n8n-node-vX.Y.Z
```

The publish workflow runs on matching tags and publishes to npm with provenance.

## Type Safety

This package uses strict TypeScript. Avoid `any` and unsafe casts in production
code. Validate unknown API responses at the boundary, narrow values before use,
and keep request/response contracts explicit.

Test casts are acceptable only at mock or fixture boundaries where the runtime
shape is intentionally being exercised.

## Code Style

- Follow the existing n8n node patterns in this repository.
- Prefer explicit, small helpers over broad utility modules.
- Keep errors actionable for n8n users.
- Keep README examples public, reproducible, and free of private environment
  details.
