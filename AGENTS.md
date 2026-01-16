# Repository Guidelines

## Project Structure & Module Organization
- `client/` — React + Vite app (entry `client/index.html`; source in `client/src/{pages,components,hooks,lib}`).
- `server/` — Express API and dev glue: `server/index.ts`, `routes.ts`, `lib/*`, `storage.ts`, `db.ts`, `vite.ts`. Serves API + client on `:5000`.
- `shared/` — Drizzle ORM schema and shared types (`shared/schema.ts`).
- `public/` — Built static assets (Vite outputs to `dist/public`).
- Config roots: `vite.config.ts` (aliases `@`, `@shared`, `@assets`), `tailwind.config.ts`, `tsconfig.json`, `.env.example`.

## Build, Test, and Development Commands
- `pnpm install` — Install dependencies.
- `pnpm dev` — Auto-detect mode; runs API + client on `:5000`.
- `pnpm dev:standalone` / `pnpm dev:system` — Force mode selection.
- `pnpm build` — Build both modes to `dist/standalone` and `dist/system`; client assets to `dist/public`.
- `pnpm deploy:standalone` — Run prod standalone: `node dist/standalone/index.js`.
- `pnpm deploy:system` — Deploy system mode to Cloudflare Workers.
- `pnpm check` — TypeScript type check.
- `pnpm db:push` — Push Drizzle schema to DB.

## Coding Style & Naming Conventions
- TypeScript + ESM; 2‑space indent. Prefer pure functions and early returns.
- Path aliases: `@/` (client), `@shared/`, `@assets/`.
- Components/pages: PascalCase (e.g., `UserMenu.tsx`). Utilities/hooks: kebab‑case or camelCase (e.g., `use-auth.ts`, `formatDate.ts`).
- Colocate modules near usage; keep files small and focused.

## Testing Guidelines
- Default validation via UI and REST endpoints.
- If adding tests, use Vitest + React Testing Library.
- Name tests `*.test.ts`/`*.test.tsx`, colocated with modules.
- Commands: `pnpm test` (watch), `pnpm test:run` (CI), `pnpm test:ui` (UI).
- Target routes, hooks, and core components.

## Commit & Pull Request Guidelines
- Commits: imperative, scoped (e.g., `server: add session route`, `chore: bump deps`).
- PRs: small and focused; include summary, rationale, and screenshots for UI changes.
- Link related issues. Call out env/DB changes and run `pnpm db:push` when schema updates.

## Security & Configuration Tips
- Copy `.env.example` to `.env`; set `DATABASE_URL`, `OPENAI_API_KEY`, etc. Never commit secrets.
- Use `server/storage.ts` for all data access; validate inputs in `server/routes.ts`.
- Avoid leaking stack traces in responses.

