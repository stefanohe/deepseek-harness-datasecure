import { clientBundle } from '../tsdown.client.ts'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const bundle = clientBundle('@deepseek-ai/dsh-client-ui-brand-official', ['lib/types/index.js'])

// datasecure: inline the brand artwork (logo png, waving gif) as base64 data
// URIs, following the ui-settings-account onboarding-assets precedent.
export default ((options) => bundle(options).map(config => ({
  ...config,
  plugins: [...(config.plugins ?? []), {
    name: 'datasecure-brand-assets',
    resolveId(source: string) {
      if (!/^\.\/assets\/[^/]+\.(?:png|gif)$/.test(source)) return null
      return fileURLToPath(new URL(`./src/client/assets/${basename(source)}`, import.meta.url))
    },
    async load(id: string) {
      if (!/\/ui-brand-official\/src\/client\/assets\/[^/]+\.(?:png|gif)$/.test(id.replaceAll('\\', '/'))) return null
      const data = await readFile(id)
      const mime = id.endsWith('.gif') ? 'image/gif' : 'image/png'
      return `export default ${JSON.stringify(`data:${mime};base64,${data.toString('base64')}`)}`
    },
  }],
}))) satisfies typeof bundle
