/** Validate the assembled application, including native Office conversion outside ASAR. */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { readDesktopRuntime, verifyDesktopRuntime } from '../src/runtime-tree.ts'
import { verifyWindowsCode } from './windows-runtime-signature.mjs'
import { smokePreparedRuntime } from './smoke-prepared-runtime.ts'
import { resolveDesktopPackageTarget } from './package-target.ts'

const paths = resolveDesktopTargetBuildPaths()
const { values } = parseArgs({ options: { unsigned: { type: 'boolean', default: false } }, allowPositionals: false })
const target = resolveDesktopBuildTarget()
const windows = target === 'win-x64'
const linux = target.startsWith('linux-')
const artifacts = values.unsigned ? paths.unsignedArtifacts : paths.artifacts
// datasecure: the productName carries the DataSecure suffix, so the executable and app bundle
// names are discovered from the artifact directory instead of upstream's literals; the count
// check keeps discovery fail-closed.
function soleArtifactName(directory: string, suffix: string, label: string, directories = false): string {
  const found = readdirSync(directory, { withFileTypes: true })
    .filter(entry => (directories ? entry.isDirectory() : entry.isFile()) && entry.name.endsWith(suffix)).map(entry => entry.name)
  const [only] = found
  if (only === undefined || found.length !== 1) throw new Error(`desktop smoke: expected exactly one ${label} named *${suffix} in ${directory}, found ${String(found.length)}`)
  return only
}
let application: string
let executable: string
if (windows) {
  application = join(artifacts, 'win-unpacked')
  executable = join(application, soleArtifactName(application, '.exe', 'executable'))
} else if (linux) {
  // datasecure: the Linux build pins executableName in the builder config, so the entry point inside
  // the unpacked directory resolves by that literal name.
  application = join(artifacts, 'linux-unpacked')
  executable = join(application, 'deepseek-harness-datasecure')
} else {
  const macRoot = join(artifacts, target === 'mac-arm64' ? 'mac-arm64' : 'mac')
  // A macOS app bundle is a directory, not a file, so discovery must accept directory entries.
  const bundle = soleArtifactName(macRoot, '.app', 'app bundle', true)
  application = join(macRoot, bundle, 'Contents')
  executable = join(application, 'MacOS', bundle.slice(0, -'.app'.length))
}
const resources = join(application, windows || linux ? 'resources' : 'Resources')
const descriptor = await verifyDesktopRuntime(paths.dsh, readDesktopRuntime(paths.dsh).release.version,
  resolveDesktopPackageTarget(target))
if (windows && !values.unsigned) await verifyWindowsCode(application)
await smokePreparedRuntime(join(resources, 'app.asar', 'dsh'), executable, join(resources, 'runtime'), descriptor)
