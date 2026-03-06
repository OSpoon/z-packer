import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { startServer } from '../mcp'

export async function mcpHandler(): Promise<void> {
  startServer().catch((error) => {
    console.error('MCP server fatal error:', error)
    process.exit(1)
  })
}

export function mcpPathHandler(): void {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = join(__filename, '..')
  const binPath = resolve(__dirname, '../../bin/z-packer-mcp.mjs')
  console.log(binPath)
}
