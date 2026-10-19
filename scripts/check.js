import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function scan(dir) {
  const paths = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${item.name}`;
    if (item.isDirectory()) paths.push(...(await scan(path)));
    else if (path.endsWith('.js')) paths.push(path);
  }
  return paths;
}
for (const f of [...(await scan('server')), ...(await scan('scripts')), ...(await scan('tests'))]) {
  const r = spawnSync(process.execPath, ['--check', f], { stdio: 'inherit' });
  if (r.status) process.exit(r.status);
}
console.log('Синтаксис серверных скриптов проверен. JSX проверяется сборкой Vite.');
