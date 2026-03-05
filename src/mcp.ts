import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { readFileSync } from 'node:fs'
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
    description: [
      'Read the z-packer configuration for the current project.',
      'Call this tool FIRST before packing or deploying to discover pre-configured SSH credentials,',
      'remote paths, archive format, and other settings stored in .zpackerrc.',
      'Returns a JSON object with all available configuration keys.',
      'If no config is found, returns an empty object — the user must then provide credentials manually.',
    ].join(' '),
    inputSchema: z.object({
      configPath: z.string().optional().describe(
        'Absolute or relative path to a custom .zpackerrc config file. '
        + 'Omit this to auto-search in the current directory and the user home directory (~/.zpackerrc).',
      ),
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
    description: [
      'Compress a local project directory into a zip, tar, or tar.gz archive.',
      'This tool respects .gitignore rules and automatically excludes the output archive itself.',
      'Use this when the user wants to package their project without deploying it.',
      'On success, returns the archive file name, output path, and total size in bytes.',
    ].join(' '),
    inputSchema: z.object({
      input: z.string().default('.').describe(
        'Path to the project directory to compress. Defaults to the current working directory ("."). '
        + 'Use an absolute path for clarity, e.g. "/Users/alice/my-project".',
      ),
      format: z.enum(['zip', 'tar', 'tar.gz']).default('zip').describe(
        'Archive format. Use "zip" for broad compatibility, "tar.gz" for smaller files on Linux servers.',
      ),
      name: z.string().optional().describe(
        'Custom base name for the output archive file (without extension). '
        + 'If omitted, the name is auto-generated from the project name and version.',
      ),
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
    description: [
      'Compress the project into an archive and upload it to a remote server over SSH/SFTP in one step.',
      'This tool automatically: (1) packs the project into an archive; (2) uploads it to the remote server; (3) deletes the local archive unless keepLocal is true.',
      'Use this when the user wants to deploy their project to a server.',
      'IMPORTANT: either "password" or "privateKeyPath" must be provided for SSH authentication.',
      'Call z_packer_get_config first to check if SSH credentials are already stored in .zpackerrc.',
      'On success, returns the remote file path. On failure, returns an error message describing the cause.',
    ].join(' '),
    inputSchema: z.object({
      input: z.string().default('.').describe(
        'Path to the project directory to compress and deploy. Defaults to current directory (".").',
      ),
      format: z.enum(['zip', 'tar', 'tar.gz']).default('zip').describe(
        'Archive format for the deployment bundle. "tar.gz" is recommended for Linux servers.',
      ),
      host: z.string().describe(
        'Hostname or IP address of the remote SSH server, e.g. "192.168.1.100" or "example.com".',
      ),
      port: z.number().default(22).describe(
        'SSH port number on the remote server. Defaults to 22.',
      ),
      username: z.string().describe(
        'Username for SSH login on the remote server.',
      ),
      password: z.string().optional().describe(
        'Password for SSH authentication. Use this OR privateKeyPath — not both.',
      ),
      privateKeyPath: z.string().optional().describe(
        'Absolute path to a local SSH private key file, e.g. "/Users/alice/.ssh/id_rsa". '
        + 'Use this OR password — not both.',
      ),
      remotePath: z.string().default('/tmp').describe(
        'Absolute path to the directory on the remote server where the archive will be uploaded.',
      ),
      keepLocal: z.boolean().default(false).describe(
        'If true, the local archive is kept after a successful upload. If false (default), it is deleted.',
      ),
    }),
  },
  async (args): Promise<CallToolResult> => {
    try {
      // 1. Pack
      const compressResult = await compress({
        input: args.input,
        format: args.format,
      })

      // outputPath is already an absolute path from compress()
      const localFilePath = compressResult.outputPath

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
export async function startServer(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('z-packer MCP server running on stdio')
}
