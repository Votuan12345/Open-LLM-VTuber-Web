// Type-check gate for the Mili fork.
//
// Upstream `npm run typecheck:web` already fails (~580 errors in the vendored
// Cubism WebSDK plus 4 unused-symbol errors in app code). This script runs the
// same checks and fails only on errors that are not part of that baseline, so
// new Mili code must type-check cleanly.
import { spawnSync } from 'node:child_process';

// Errors outside src/renderer/WebSDK that exist on upstream main (d176e7d).
// Keyed without line numbers so unrelated edits in these files don't break it.
const BASELINE = new Set([
  'src/renderer/src/components/sidebar/chat-history-panel.tsx|TS6192|All imports in import declaration are unused.',
  "src/renderer/src/context/live2d-config-context.tsx|TS6133|'confUid' is declared but its value is never read.",
  "src/renderer/src/hooks/sidebar/use-sidebar.ts|TS6133|'ModeType' is declared but its value is never read.",
  "src/renderer/src/hooks/utils/use-audio-task.ts|TS6196|'Live2DModel' is declared but never used.",
]);

const IGNORED_PREFIX = 'src/renderer/WebSDK/';
const ERROR_RE = /^(.+?)\(\d+,\d+\): error (TS\d+): (.*)$/;

function run(project) {
  const res = spawnSync('npx', ['tsc', '--noEmit', '-p', project, '--composite', 'false'], {
    encoding: 'utf8',
    shell: true,
  });
  return `${res.stdout}\n${res.stderr}`;
}

const newErrors = [];
for (const project of ['tsconfig.node.json', 'tsconfig.web.json']) {
  for (const line of run(project).split(/\r?\n/)) {
    const m = ERROR_RE.exec(line.trim());
    if (!m) continue;
    const file = m[1].replace(/\\/g, '/');
    if (file.startsWith(IGNORED_PREFIX)) continue;
    if (BASELINE.has(`${file}|${m[2]}|${m[3]}`)) continue;
    newErrors.push(line.trim());
  }
}

if (newErrors.length > 0) {
  console.error(`[mili-typecheck] ${newErrors.length} error(s) outside the upstream baseline:`);
  for (const e of newErrors) console.error(`  ${e}`);
  process.exit(1);
}
console.log('[mili-typecheck] OK (no errors outside the upstream baseline)');
