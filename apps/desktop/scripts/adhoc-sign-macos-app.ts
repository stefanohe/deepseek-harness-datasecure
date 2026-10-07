/** Ad-hoc sign a freshly built macOS app bundle so Apple Silicon hosts can execute it. */

import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const appPath = process.argv[2]
if (appPath === undefined) throw new Error('usage: tsx scripts/adhoc-sign-macos-app.ts <path-to-app>')
execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', resolve(appPath)], { stdio: 'inherit' })
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', resolve(appPath)], { stdio: 'inherit' })
process.stdout.write(`desktop macOS signing: ad-hoc signed ${resolve(appPath)}\n`)
