import { statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const viteExecutable = resolve(
  repoRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite',
);
const outputDir = resolve(repoRoot, 'dist', 'public');
const indexPath = resolve(outputDir, 'index.html');

console.log(`[worker-assets] repo=${repoRoot}`);
console.log(`[worker-assets] vite=${viteExecutable}`);

const build = spawnSync(
  viteExecutable,
  ['build', '--outDir', 'dist/public'],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
    env: process.env,
  },
);

if (build.error) {
  console.error('[worker-assets] failed to start Vite:', build.error);
  process.exit(1);
}

if (build.status !== 0) {
  console.error(`[worker-assets] Vite exited with status ${build.status ?? 'unknown'}`);
  process.exit(build.status ?? 1);
}

let stat;
try {
  stat = statSync(indexPath);
} catch (error) {
  console.error(
    `[worker-assets] missing artifact ${relative(repoRoot, indexPath)} after successful Vite build:`,
    error,
  );
  process.exit(1);
}

if (!stat.isFile() || stat.size <= 0) {
  console.error(
    `[worker-assets] invalid artifact ${relative(repoRoot, indexPath)}: isFile=${stat.isFile()} size=${stat.size}`,
  );
  process.exit(1);
}

console.log(
  `[worker-assets] verified ${relative(repoRoot, indexPath)} (${stat.size} bytes)`,
);
