# Repository Guidelines

## Project Structure & Module Organization
- `client/` — React + Vite app. Entry: `client/index.html`; app code in `client/src/{pages,components,hooks,lib}`.
- `server/` — Express API + dev glue: `server/index.ts`, `routes.ts`, `lib/*`, `storage.ts`, `db.ts`, `vite.ts`. Serves API and client on port 5000.
- `shared/` — Drizzle ORM schema and shared types: `shared/schema.ts`.
- `public/` — Built static assets (Vite builds to `dist/public`).
- Config roots: `vite.config.ts` (aliases `@`, `@shared`, `@assets`), `tailwind.config.ts`, `tsconfig.json`, `.env.example`.

## Build, Test, and Development Commands
- `npm install` — Install dependencies.
- `npm run dev` — Auto-detect mode; runs API + client on :5000.
- `npm run dev:standalone` / `npm run dev:system` — Force mode selection.
- `npm run build` — Build both modes to `dist/standalone` and `dist/system`.
- `npm run deploy:standalone` — Run prod standalone: `node dist/standalone/index.js`.
- `npm run deploy:system` — Deploy system mode to Cloudflare Workers.
- `npm run check` — TypeScript type check.
- `npm run db:push` — Push Drizzle schema to DB.

## Coding Style & Naming Conventions
- TypeScript + ESM, 2-space indent. Prefer pure functions and early returns.
- Path aliases: `@/` (client), `@shared/`, `@assets/`.
- Components/pages: PascalCase (e.g., `UserMenu.tsx`). Utilities/hooks: kebab-case or camelCase (e.g., `use-auth.ts`, `formatDate.ts`).
- Colocate near usage. Keep modules small and focused.

## Testing Guidelines
- No tests by default; validate via UI and REST endpoints.
- If adding tests: Vitest + React Testing Library; colocate as `*.test.ts(x)` beside modules.
- Run tests with `vitest` (add an npm script if needed). Aim tests at routes, hooks, core components.

## Commit & Pull Request Guidelines
- Commits: imperative, scoped. Examples: `server: add session route`, `chore: bump deps`.
- PRs: small and focused. Include summary, rationale, and screenshots for UI changes. Link related issues. Call out env/DB changes and run `npm run db:push` when schema updates.

## Security & Configuration Tips
- Copy `.env.example` to `.env`; set `DATABASE_URL`, `OPENAI_API_KEY`, etc. Never commit secrets.
- Use `server/storage.ts` for all data access; validate inputs in `server/routes.ts`. Avoid leaking stack traces in responses.
