/** Materialize the complete production runtime before publishing Desktop resources. */

import { packagingStep } from './packaging-step.mjs'
import { spawn } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { delimiter, join, relative, resolve } from 'node:path'
import { create as createTar, extract as extractTar } from 'tar'
import { desktopNodeEnvironment } from '../src/node-environment.ts'
import { createRuntimeProjectMetadata } from '../src/project-manager.ts'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../src/host-protocol.ts'
import { parseDesktopRelease, type DesktopRelease } from '../src/release.ts'
import {
  DESKTOP_HOST_PACKAGE,
  DESKTOP_HOST_RUNTIME_FILES,
  DESKTOP_PACKAGES_DIR,
  DESKTOP_PACKAGE_SET_FILE,
  readDesktopCorePackageSet,
  verifyDesktopCoreLockfile,
} from '../src/core-package-set.ts'
import { smokePrimaryRuntime } from './prepare-primary-runtime.ts'
import { smokePreparedRuntime } from './smoke-prepared-runtime.ts'
import { prepareRuntimeManifests } from './prepare-runtime-manifests.ts'
import { writeDesktopRuntime, verifyDesktopRuntime } from '../src/runtime-tree.ts'
import {
  resolveDesktopAppId,
  resolveMacOSSigningEnvironment,
  resolveNpmRegistry,
} from './desktop-release-environment.mjs'
import {
  signMacOSRuntime,
  signMacOSRuntimeAdhoc,
} from './macos-runtime.ts'
import { desktopTargetPlatform, resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { desktopRuntimeFileExclusion } from './runtime-file-policy.ts'
import { selectOfficeEngine } from '../../../scripts/libreoffice-packages.mjs'

const APP_ROOT = resolve(import.meta.dirname, '..')
const BUILD_PATHS = resolveDesktopTargetBuildPaths()
const DSH_OUTPUT_ROOT = BUILD_PATHS.dsh
const BUILD_ROOT = mkdtempSync(join(tmpdir(), 'dsh-desktop-runtime-'))
// Keep the runtime pnpm store in the git-ignored .desktop-build directory instead of the
// throwaway temp root, so a warm store persists across runs and packaging stops
// re-downloading ~260 tarballs every time. The store is content-addressed and lockfile
// integrity-checked, so a stale entry can never substitute wrong bytes.
const STORE_ROOT = resolve(BUILD_PATHS.root, '..', '..', 'runtime-pnpm-store')
// Persist the generated runtime lockfile across runs so `install --lockfile-only` reuses a
// complete resolution instead of re-fetching registry metadata, which is the remaining
// network dependency for offline packaging. A stale lockfile still re-resolves online
// (self-healing), so correctness never trades on speed.
const LOCKFILE_PERSIST = resolve(BUILD_PATHS.root, '..', '..', 'runtime-pnpm-lock.yaml')
const RUNTIME_ROOT = BUILD_PATHS.runtime
const PNPM_BUILD_STATE = BUILD_PATHS.dshPnpm
const PACKAGE_SET_ROOT = BUILD_PATHS.packageSet
const NODE = join(BUILD_PATHS.electron, process.platform === 'win32' ? 'electron.exe' : 'Electron.app/Contents/MacOS/Electron')
const PNPM = join(RUNTIME_ROOT, 'pnpm', 'bin', 'pnpm.mjs')

// `pnpm pack` rewrites `workspace:` specifiers into the packed manifest with dependency-graph
// iteration order, so identical sources yield different tarball bytes on every run; the persisted
// lockfile's integrity for the local tarballs then mismatches and an offline frozen install dies
// on the checksum. Stage normalized tarballs instead — sorted dependency keys, fixed tar
// metadata — so the same sources converge to identical bytes across runs. The package-set
// descriptor is rewritten to match the normalized bytes.
const MANIFEST_DEP_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const
const PKG_TAR_EPOCH = new Date(499_162_500_000)

function stageDeterministicTarball(source: string, destination: string): Buffer {
  const scratch = mkdtempSync(join(tmpdir(), 'dsh-tarball-normalize-'))
  try {
    extractTar({ file: source, cwd: scratch, sync: true })
    const manifestPath = join(scratch, 'package', 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    for (const section of MANIFEST_DEP_SECTIONS) {
      const deps = manifest[section]
      if (deps !== null && typeof deps === 'object' && !Array.isArray(deps)) {
        const sorted = Object.entries(deps as Record<string, unknown>).sort(([left], [right]) => (left < right ? -1 : 1))
        manifest[section] = Object.fromEntries(sorted)
      }
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)
    utimesSync(manifestPath, PKG_TAR_EPOCH, PKG_TAR_EPOCH)
    // Explicit sorted entry list with noDirRecurse: node-tar has no `sort` option (v7.5.22), so walking
    // 'package' would archive in platform-dependent readdir order; enumerating every entry in sorted
    // pre-order makes the member sequence deterministic on every file system.
    const byName = (left: string, right: string): number => (left < right ? -1 : 1)
    const entries: string[] = []
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir).sort(byName)) {
        const full = join(dir, name)
        entries.push(relative(scratch, full).replaceAll('\\', '/'))
        if (statSync(full).isDirectory()) walk(full)
      }
    }
    walk(join(scratch, 'package'))
    createTar.syncFile({ file: destination, cwd: scratch, gzip: true, portable: true, sync: true, noDirRecurse: true }, entries)
    return readFileSync(destination)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/**
 * Refresh the `file:desktop-packages/...` integrities in a seeded lockfile from the staged bytes.
 * These tarballs are this repository's own packed workspace packages, so recomputing their hashes is
 * safe and keeps source-only edits fully offline; anything the repair cannot fix (a missing tarball, a
 * changed dependency graph) still fails the frozen check and falls back to online re-resolution.
 */
function repairStagedTarballIntegrity(lockfilePath: string, stagedPackagesDir: string): void {
  const lockfile = readFileSync(lockfilePath, 'utf8')
  const repaired = lockfile.replace(
    /integrity: sha512-[A-Za-z0-9+/=]+, tarball: file:desktop-packages\/([^}\s]+)/g,
    (whole, name: string) => {
      const file = join(stagedPackagesDir, name)
      if (!existsSync(file)) return whole
      return `integrity: sha512-${createHash('sha512').update(readFileSync(file)).digest('base64')}, tarball: file:desktop-packages/${name}`
    },
  )
  if (repaired !== lockfile) writeFileSync(lockfilePath, repaired)
}

function manifestVersion(path: string, subject: string): string {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown }
  if (typeof manifest.version !== 'string') throw new Error(`desktop runtime: ${subject} has no version`)
  return manifest.version
}

function desktopRelease(): DesktopRelease {
  const version = manifestVersion(join(APP_ROOT, 'package.json'), 'desktop package')
  const dshVersion = manifestVersion(resolve(APP_ROOT, '..', '..', 'package.json'), 'root dsh package')
  if (version !== dshVersion) {
    throw new Error(`desktop runtime: Electron ${version} must bind the same version of @deepseek-ai/dsh, found ${dshVersion}`)
  }
  const runtime = JSON.parse(readFileSync(join(RUNTIME_ROOT, 'versions.json'), 'utf8')) as Record<string, unknown>
  return parseDesktopRelease({
    schemaVersion: 1,
    version,
    hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
    nodeVersion: runtime.node,
    pnpmVersion: runtime.pnpm,
  })
}

function runPnpm(args: readonly string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const [command, ...commandArgs] = args
    if (command === undefined) throw new Error('desktop runtime: pnpm command is required')
    const registry = resolveNpmRegistry(process.env)
    const config = join(PNPM_BUILD_STATE, 'config')
    const userConfig = join(config, 'npmrc')
    mkdirSync(config, { recursive: true })
    writeFileSync(userConfig, '')
    const child = spawn(NODE, [
      '--expose-internals',
      PNPM,
      `--config.registry=${registry}`,
      `--config.store-dir=${STORE_ROOT}`,
      '--config.enable-global-virtual-store=false',
      `--config.userconfig=${userConfig}`,
      command,
      ...commandArgs,
    ], {
      cwd: BUILD_ROOT,
      env: {
        ...Object.fromEntries(Object.entries(process.env).filter(([name]) => (
          name !== 'NODE_OPTIONS' && name !== 'NODE_PATH' && !/^DSH_DESKTOP_/u.test(name) && !/^(?:npm|pnpm|corepack)_/iu.test(name)
        ))),
        NPM_CONFIG_REGISTRY: registry,
        NPM_CONFIG_STORE_DIR: STORE_ROOT,
        NPM_CONFIG_USERCONFIG: userConfig,
        ...desktopNodeEnvironment(NODE, join(RUNTIME_ROOT, 'bin'), {}),
        PATH: `${join(RUNTIME_ROOT, 'bin')}${delimiter}${process.env.PATH ?? ''}`,
        XDG_CACHE_HOME: join(PNPM_BUILD_STATE, 'cache'),
        XDG_CONFIG_HOME: config,
        XDG_STATE_HOME: join(PNPM_BUILD_STATE, 'state'),
      },
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`desktop runtime: pnpm exited with ${String(code ?? signal)}`))
    })
  })
}

async function main(): Promise<void> {
  try {
    await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'runtime:reset', async () => {
      rmSync(DSH_OUTPUT_ROOT, { recursive: true, force: true })
      rmSync(PNPM_BUILD_STATE, { recursive: true, force: true })
      mkdirSync(STORE_ROOT, { recursive: true })
    })
    const release = desktopRelease()
    await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'runtime:stage-packages', async () => {
      const packageSetPath = join(BUILD_ROOT, DESKTOP_PACKAGE_SET_FILE)
      copyFileSync(join(PACKAGE_SET_ROOT, DESKTOP_PACKAGE_SET_FILE), packageSetPath)
      type StagedPackageSet = { packages: Array<{ file: string; bytes: number; integrity: string }> }
      const packageSet = JSON.parse(readFileSync(packageSetPath, 'utf8')) as StagedPackageSet
      const stagedDir = join(BUILD_ROOT, DESKTOP_PACKAGES_DIR)
      mkdirSync(stagedDir, { recursive: true })
      for (const record of packageSet.packages) {
        const body = stageDeterministicTarball(join(PACKAGE_SET_ROOT, DESKTOP_PACKAGES_DIR, record.file), join(stagedDir, record.file))
        record.bytes = body.byteLength
        record.integrity = `sha512-${createHash('sha512').update(body).digest('base64')}`
      }
      writeFileSync(packageSetPath, `${JSON.stringify(packageSet, undefined, 2)}\n`)
      createRuntimeProjectMetadata(BUILD_ROOT, release)
    })
    await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'runtime:lockfile', async () => {
      // A plain `install --lockfile-only` re-resolves every spec against the registry even when a
      // complete lockfile already exists, which makes offline packaging impossible. With a
      // persisted lockfile, first try `--frozen-lockfile --trust-lockfile` (pure offline
      // validation, proven network-free with the runtime pnpm 11.7.0; --trust-lockfile skips the
      // supply-chain policy re-check, which re-hits the registry per package — content integrity
      // is still enforced by the lockfile hashes and the content-addressed store, same trade the
      // runtime:install step already makes).
      // Local tarball integrities are first repaired from the staged bytes (see repairStagedTarballIntegrity),
      // so source-only edits never cost the offline path; a lockfile stale in its dependency graph
      // fails the frozen check and falls back to the online re-resolution below, so a dependency
      // bump still self-heals.
      if (existsSync(LOCKFILE_PERSIST)) {
        copyFileSync(LOCKFILE_PERSIST, join(BUILD_ROOT, 'pnpm-lock.yaml'))
        repairStagedTarballIntegrity(join(BUILD_ROOT, 'pnpm-lock.yaml'), join(BUILD_ROOT, DESKTOP_PACKAGES_DIR))
        try {
          await runPnpm(['install', '--lockfile-only', '--frozen-lockfile', '--trust-lockfile'])
          copyFileSync(join(BUILD_ROOT, 'pnpm-lock.yaml'), LOCKFILE_PERSIST)
          return
        } catch {
          rmSync(join(BUILD_ROOT, 'pnpm-lock.yaml'), { force: true })
        }
      }
      await runPnpm(['install', '--lockfile-only'])
      copyFileSync(join(BUILD_ROOT, 'pnpm-lock.yaml'), LOCKFILE_PERSIST)
    })
    verifyDesktopCoreLockfile(
      readFileSync(join(BUILD_ROOT, 'pnpm-lock.yaml'), 'utf8'),
      readDesktopCorePackageSet(BUILD_ROOT, release.version),
    )
    await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'runtime:install', () => runPnpm(['install', '--prod', '--frozen-lockfile', '--trust-lockfile']))
    const packageSet = readDesktopCorePackageSet(BUILD_ROOT, release.version)
    const targetName = resolveDesktopBuildTarget()
    const target = { platform: process.platform, arch: desktopTargetPlatform(targetName).arch }
    const modules = join(BUILD_ROOT, 'node_modules')
    const officeManifest = JSON.parse(readFileSync(join(modules, '@deepseek-ai/libreoffice-kit/package.json'), 'utf8'))
    const officeEngine = selectOfficeEngine(officeManifest, target)
    mkdirSync(DSH_OUTPUT_ROOT, { recursive: true })
    await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'runtime:materialize-modules', async () => {
      cpSync(modules, join(DSH_OUTPUT_ROOT, 'node_modules'), {
        recursive: true, dereference: true,
        filter: source => desktopRuntimeFileExclusion(relative(modules, source), target, officeEngine) === undefined,
      })
    })
    writeFileSync(join(DSH_OUTPUT_ROOT, 'package.json'), `${JSON.stringify({
      name: '@deepseek-ai/dsh-desktop-runtime', private: true, version: release.version, type: 'module',
      dependencies: Object.fromEntries(packageSet.packages.map(entry => [entry.name, entry.version])),
    }, undefined, 2)}\n`)
    for (const file of DESKTOP_HOST_RUNTIME_FILES) {
      if (!existsSync(join(DSH_OUTPUT_ROOT, 'node_modules', DESKTOP_HOST_PACKAGE, file))) {
        throw new Error(`desktop runtime: missing private Host file ${file}`)
      }
    }
    if (!existsSync(join(DSH_OUTPUT_ROOT, 'node_modules', '@deepseek-ai', `libreoffice-kit-${officeEngine}`, 'prebuilds.json'))) {
      throw new Error(`desktop runtime: missing required LibreOffice engine ${officeEngine}`)
    }
    if (process.platform === 'darwin') {
      if (process.env.DSH_DESKTOP_UNSIGNED === '1') {
        // Unsigned builds have no Developer ID on the host, but Apple Silicon hosts still require
        // a signature to execute the runtime, so native files are ad-hoc signed instead.
        await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'sign:dsh-native', () => signMacOSRuntimeAdhoc(DSH_OUTPUT_ROOT, resolveDesktopAppId(process.env)))
        await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'sign:primary-native', () => signMacOSRuntimeAdhoc(join(RUNTIME_ROOT, 'primary-runtime'), resolveDesktopAppId(process.env)))
      } else {
        await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'sign:dsh-native', () => signMacOSRuntime(DSH_OUTPUT_ROOT, resolveDesktopAppId(process.env), resolveMacOSSigningEnvironment(process.env), target.arch, join(BUILD_PATHS.root, 'signature-cache')))
        await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'sign:primary-native', () => signMacOSRuntime(join(RUNTIME_ROOT, 'primary-runtime'), resolveDesktopAppId(process.env), resolveMacOSSigningEnvironment(process.env), target.arch, join(BUILD_PATHS.root, 'signature-cache')))
      }
    }
    await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'runtime:manifests', () => prepareRuntimeManifests(DSH_OUTPUT_ROOT))
    await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'runtime:primary-smoke', async () => smokePrimaryRuntime(join(RUNTIME_ROOT, 'primary-runtime')))
    await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'runtime:write-descriptor', async () => writeDesktopRuntime(DSH_OUTPUT_ROOT, release, packageSet.packages.map(entry => entry.name), target))
    const descriptor = await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'runtime:verify-before-smoke', () => verifyDesktopRuntime(DSH_OUTPUT_ROOT, release.version, target))
    if (!process.argv.includes('--defer-runtime-smoke')) {
      await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'runtime:smoke', () => smokePreparedRuntime(DSH_OUTPUT_ROOT, NODE, RUNTIME_ROOT, descriptor))
      await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'runtime:verify-after-smoke', () => verifyDesktopRuntime(DSH_OUTPUT_ROOT, release.version, target))
    }
  } catch (error) {
    rmSync(DSH_OUTPUT_ROOT, { recursive: true, force: true })
    throw error
  } finally {
    let cleaned = false
    const cleanup = (): void => {
      try { rmSync(BUILD_ROOT, { recursive: true, force: true }) }
      finally { rmSync(PNPM_BUILD_STATE, { recursive: true, force: true }) }
      cleaned = true
    }
    try { await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'runtime:cleanup', async () => cleanup()) }
    finally { if (!cleaned) cleanup() }
  }
}

await main()
