import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'

const require = createRequire(import.meta.url)
const cesiumSource = join(dirname(require.resolve('cesium/package.json')), 'Build/Cesium')
const cesiumBaseUrl = 'cesiumStatic'
const cesiumGlobSource = cesiumSource.replace(/\\/g, '/')
const cesiumAssetDirs = ['ThirdParty', 'Workers', 'Assets', 'Widgets']

// https://vite.dev/config/
export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify(cesiumBaseUrl),
  },
  build: {
    outDir: 'dist-web',
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: cesiumAssetDirs.map((dir) => ({
        src: `${cesiumGlobSource}/${dir}/**/*`,
        dest: cesiumBaseUrl,
        rename: (_name, _ext, fullPath) =>
          relative(cesiumSource, fullPath).replace(/\\/g, '/'),
      })),
    }),
  ],
})
