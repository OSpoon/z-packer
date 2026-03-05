import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { compress } from './compress'
import { loadConfig } from './config'
import { upload } from './upload'

console.error('[z-packer] MCP script loading...')

const server = new McpServer({
  name: 'z-packer',
  version: '0.2.1',
})

// --- Tool: get_config ---
server.registerTool(
  'z_packer_get_config',
  {
    description: 'Read the current z-packer configuration (from .zpackerrc or ~/.zpackerrc)',
    inputSchema: z.object({
      configPath: z.string().optional().describe('Path to a custom config file'),
    }),
  },
  async ({ configPath }): Promise<CallToolResult> => {
    try {
      const config = loadConfig(configPath)
      return {
        content: [{ type: 'text', text: JSON.stringify(config, null, 2) }],
      }
    }
    catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to load config: ${(error as Error).message}` }],
      }
    }
  },
)

// --- Tool: pack ---
server.registerTool(
  'z_packer_pack',
  {
    description: 'Compress the project into a zip, tar, or tar.gz archive',
    inputSchema: z.object({
      input: z.string().default('.').describe('Project directory to compress'),
      format: z.enum(['zip', 'tar', 'tar.gz']).default('zip').describe('Archive format'),
      name: z.string().optional().describe('Output file name (optional)'),
    }),
  },
  async ({ input, format, name }): Promise<CallToolResult> => {
    try {
      const result = await compress({
        input,
        format,
        name,
      })
      return {
        content: [{ type: 'text', text: `Successfully created archive: ${result.zipName}\nOutput path: ${result.outputPath}\nTotal size: ${result.totalSize} bytes` }],
      }
    }
    catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Compression failed: ${(error as Error).message}` }],
      }
    }
  },
)

// --- Tool: deploy ---
server.registerTool(
  'z_packer_deploy',
  {
    description: 'Compress the project and upload to a remote server via SSH/SFTP',
    inputSchema: z.object({
      input: z.string().default('.').describe('Project directory to compress'),
      format: z.enum(['zip', 'tar', 'tar.gz']).default('zip').describe('Archive format'),
      host: z.string().describe('Remote server hostname or IP'),
      port: z.number().default(22).describe('SSH port'),
      username: z.string().describe('SSH login username'),
      password: z.string().optional().describe('SSH password'),
      privateKeyPath: z.string().optional().describe('Path to SSH private key file'),
      remotePath: z.string().default('/tmp').describe('Remote directory to upload into'),
      keepLocal: z.boolean().default(false).describe('Keep the local archive after upload'),
    }),
  },
  async (args): Promise<CallToolResult> => {
    try {
      // 1. Pack
      const compressResult = await compress({
        input: args.input,
        format: args.format,
      })

      const localFilePath = join(process.cwd(), compressResult.zipName)

      // 2. Resolve Private Key if provided as path
      let privateKey: string | undefined
      if (args.privateKeyPath) {
        privateKey = readFileSync(args.privateKeyPath, 'utf-8')
      }

      // 3. Upload
      const uploadResult = await upload({
        localFile: localFilePath,
        host: args.host,
        port: args.port,
        username: args.username,
        password: args.password,
        privateKey,
        remotePath: args.remotePath,
      })

      // 4. Cleanup
      if (!args.keepLocal) {
        const fs = await import('fs-extra')
        await fs.default.remove(localFilePath)
      }

      return {
        content: [{
          type: 'text',
          text: `Deployment successful!\nRemote file: ${uploadResult.remoteFile}\nLocal archive ${args.keepLocal ? 'kept' : 'removed'}.`,
        }],
      }
    }
    catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Deployment failed: ${(error as Error).message}` }],
      }
    }
  },
)

// Initializing the server with Stdio transport
async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('z-packer MCP server running on stdio')
}

main().catch((error) => {
  console.error('MCP server fatal error:', error)
  process.exit(1)
})
