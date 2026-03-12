import process from 'node:process'
import yargs from 'yargs'
import { deployHandler } from './commands/deploy'
import { initHandler } from './commands/init'
import { mcpHandler, mcpPathHandler } from './commands/mcp'
import { packHandler } from './commands/pack'

const instance = yargs(process.argv.slice(2))
  .scriptName('z-packer')
  .usage('$0 [input]')
  // ── pack (default) ───────────────────────────────────────────────────────────
  .command(
    ['$0 [input]', 'pack [input]'],
    'Compress project (default command)',
    (y) => {
      return y
        .positional('input', {
          type: 'string',
          default: '.',
          describe: 'Project directory',
        })
        .option('format', {
          type: 'string',
          choices: ['zip', 'tar', 'tar.gz'],
          describe: 'Archive format: zip | tar | tar.gz (default: zip)',
        })
        .option('config', {
          type: 'string',
          describe: 'Path to a custom config file (default: .zpackerrc)',
        })
        .option('dry-run', {
          type: 'boolean',
          default: false,
          describe: 'Preview files to be packed without creating an archive',
        })
    },
    packHandler,
  )
  // ── deploy ───────────────────────────────────────────────────────────────────
  .command(
    'deploy [input]',
    'Compress project then upload to a remote server via SSH/SFTP',
    (y) => {
      return y
        .positional('input', {
          type: 'string',
          default: '.',
          describe: 'Project directory to compress',
        })
        .option('config', {
          type: 'string',
          describe: 'Path to a custom config file (default: .zpackerrc)',
        })
        .option('format', {
          type: 'string',
          choices: ['zip', 'tar', 'tar.gz'],
          describe: 'Archive format: zip | tar | tar.gz (default: zip)',
        })
        .option('host', {
          type: 'string',
          describe: 'Remote server hostname or IP',
        })
        .option('port', {
          type: 'number',
          describe: 'SSH port (default: 22)',
        })
        .option('username', {
          type: 'string',
          describe: 'SSH login username',
        })
        .option('password', {
          type: 'string',
          describe: 'SSH password (use --private-key for key-based auth)',
        })
        .option('private-key', {
          type: 'string',
          describe: 'Path to SSH private key file (~/.ssh/id_rsa)',
        })
        .option('remote-path', {
          type: 'string',
          describe: 'Remote directory to upload the archive into (default: /tmp)',
        })
        .option('post-cmd', {
          type: 'string',
          array: true,
          describe: 'Additional remote command to run after deploy (can be repeated; supports {{remoteFile}})',
        })
        .option('post-script', {
          type: 'string',
          array: true,
          describe: 'Local script path to upload and execute after deploy (can be repeated)',
        })
        .option('keep-local', {
          type: 'boolean',
          describe: 'Keep the local archive after upload',
        })
        .option('ready-timeout', {
          type: 'number',
          describe: 'SSH connection ready timeout in milliseconds (default: 20000)',
        })
    },
    deployHandler,
  )
  // ── init ─────────────────────────────────────────────────────────────────────
  .command(
    'init',
    'Generate a .zpackerrc config template in the current directory',
    (y) => {
      return y
        .option('force', {
          type: 'boolean',
          default: false,
          describe: 'Overwrite existing .zpackerrc file',
        })
    },
    initHandler,
  )
  // ── mcp ──────────────────────────────────────────────────────────────────────
  .command(
    'mcp',
    'Start the z-packer MCP server (for use with Claude Desktop / LM Studio)',
    () => {},
    mcpHandler,
  )
  // ── mcp-path ─────────────────────────────────────────────────────────────────
  .command(
    'mcp-path',
    'Print the absolute path to the MCP server script',
    () => {},
    mcpPathHandler,
  )
  .showHelpOnFail(false)
  .help()

instance.parse()
