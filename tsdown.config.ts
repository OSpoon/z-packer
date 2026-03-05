import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
    mcp: 'src/mcp.ts',
  },
  format: ['esm'],
  exports: true,
  dts: true,
  clean: true,
})
