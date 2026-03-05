import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/cli.ts',
    'src/mcp.ts',
  ],
  format: ['esm'],
  exports: true,
  dts: true,
  clean: true,
})
