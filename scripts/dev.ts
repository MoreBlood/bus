// `npm run dev`: API (src/local.ts, перезапуск при правках) + Vite с горячей перезагрузкой.
// Открывать http://localhost:5173 — Vite проксирует /api и /mcp на :5055.
import { spawn } from 'node:child_process';

const root = new URL('../', import.meta.url).pathname;
const procs = [
  spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--watch-path=src', 'src/local.ts'], {
    cwd: root,
    stdio: 'inherit',
    // PORT мог прийти от окружения для Vite — API всегда на своём порту (его ждёт прокси Vite)
    env: { ...process.env, PORT: process.env.API_PORT || '5055' },
  }),
  spawn('npm', ['run', 'dev', '--prefix', 'web'], { cwd: root, stdio: 'inherit' }),
];
const stop = () => {
  for (const p of procs) p.kill('SIGTERM');
  process.exit();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => code && stop());
