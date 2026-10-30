import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const destination = process.argv[2]
if (!destination || !path.isAbsolute(destination) || process.argv.length !== 3) {
  throw new Error('Usage: node deployment/hostinger/package.mjs /absolute/path/to/new/output-directory')
}
await mkdir(destination, { recursive: true })
if ((await readdir(destination)).length) throw new Error('The output directory must be empty.')

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  if (result.error || result.status !== 0) {
    throw result.error || new Error(`${command} failed: ${result.stderr || result.stdout}`)
  }
}

const frontend = path.join(destination, 'frontend')
const backend = path.join(destination, 'backend')
await mkdir(frontend)
await mkdir(backend)
for (const name of ['index.html', '.htaccess', 'assets', 'paper-notes-favicon.svg', 'paper-notes-favicon.png']) {
  await cp(path.join(root, 'dist', name), path.join(frontend, name), { recursive: true })
}
for (const name of ['index.php', 'Database.php', 'NoteContent.php', 'NoteSession.php', '.htaccess']) {
  if (name.endsWith('.php')) run('php', ['-l', path.join(root, 'api', name)])
  await cp(path.join(root, 'api', name), path.join(backend, name))
}

const files = []
async function fingerprint(directory, relative = '') {
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const name = path.join(relative, entry.name)
    if (entry.isDirectory()) await fingerprint(directory, name)
    else {
      const bytes = await readFile(path.join(directory, name))
      files.push({ file: `${path.basename(directory)}/${name}`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
    }
  }
}
await fingerprint(frontend)
await fingerprint(backend)
run('zip', ['-q', '-r', path.join(destination, 'notes-frontend.zip'), '.'], frontend)
run('zip', ['-q', '-r', path.join(destination, 'notes-backend-update.zip'), '.'], backend)
const combined = path.join(destination, 'update')
await cp(frontend, combined, { recursive: true })
await cp(backend, path.join(combined, 'api'), { recursive: true })
run('zip', ['-q', '-r', path.join(destination, 'notes-update.zip'), '.'], combined)
await writeFile(path.join(destination, 'manifest.json'), `${JSON.stringify({ created_at: new Date().toISOString(), mode: 'update', files }, null, 2)}\n`)
console.log(`Created Hostinger update packages in ${destination}; production config.php and database exports are excluded.`)
