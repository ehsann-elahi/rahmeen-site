import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const php = process.env.PHP_BINARY || (process.platform === 'win32' && existsSync('C:\\xamp 8\\php\\php.exe') ? 'C:\\xamp 8\\php\\php.exe' : 'php');
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535.');
const uploadTemp = resolve(process.env.RAHMEEN_STORAGE_DIR || resolve(root, 'storage'), 'upload-temp');
mkdirSync(uploadTemp, { recursive: true, mode: 0o700 });
const child = spawn(php, ['-d', `upload_tmp_dir=${uploadTemp}`, '-d', 'display_errors=0', '-d', 'upload_max_filesize=8M', '-d', 'post_max_size=10M', '-S', `127.0.0.1:${port}`, '-t', 'dist', 'router.php'], {
  cwd: root,
  env: { ...process.env, APP_ENV: 'local' },
  stdio: 'inherit',
  windowsHide: true,
});
child.once('spawn', () => {
  console.log(`Store: http://127.0.0.1:${port}/`);
  console.log(`Admin: http://127.0.0.1:${port}/admin/`);
});
child.once('error', error => {
  console.error(`PHP could not start: ${error.message}. Install PHP 8.2+ with PDO SQLite or set PHP_BINARY.`);
  process.exitCode = 1;
});
child.once('exit', code => { process.exitCode = code || 0; });
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
