import process from 'node:process'
import chalk from 'chalk'
import { Presets, SingleBar } from 'cli-progress'
import Table from 'cli-table3'
import { filesize } from 'filesize'
import yargs from 'yargs'
import { compress } from './compress'

const instance = yargs(process.argv.slice(2))
  .scriptName('z-packer')
  .usage('$0 [input]')
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
    },
    async (argv) => {
      const input = argv.input as string
      let progressBar: SingleBar | undefined

      try {
        const result = await compress({
          input,
          onScan: (path) => {
            console.log(chalk.cyan(`🔍 Scanning project: ${chalk.bold(path)}`))
          },
          onFound: (count) => {
            if (count === 0) {
              console.log(chalk.yellow('⚠️ No files found (check your .gitignore rules)'))
            }
            else {
              console.log(chalk.green(`✅ Found ${chalk.bold(count)} files`))
            }
          },
          onStart: (outputPath) => {
            console.log(chalk.cyan(`📦 Creating archive: ${chalk.bold(outputPath)}`))
            progressBar = new SingleBar({
              format: `${chalk.cyan('Compressing')} {bar} | {percentage}% | {value}/{total} files`,
              hideCursor: true,
            }, Presets.shades_classic)
          },
          onProgress: (current, total) => {
            if (progressBar) {
              if (current === 1)
                progressBar.start(total, 0)
              progressBar.update(current)
            }
          },
        })

        if (progressBar)
          progressBar.stop()

        if (result.files.length > 0) {
          if (result.files.length <= 20) {
            const table = new Table({
              head: [chalk.cyan('Filename'), chalk.cyan('Size'), chalk.cyan('Status')],
              colWidths: [40, 15, 12],
            })
            for (const file of result.files) {
              table.push([file.name, filesize(file.size), chalk.gray(file.status)])
            }
            console.log(`\n${table.toString()}`)
          }

          console.log(chalk.green('\n✨ Project archived successfully!'))
          console.log(chalk.white(`   Archive: ${chalk.bold(result.zipName)}`))
          console.log(chalk.white(`   Total Size: ${chalk.bold(filesize(result.totalSize))}`))
        }
        console.log()
      }
      catch (error) {
        if (progressBar)
          progressBar.stop()
        console.error(chalk.red('\n❌ Compression failed:'), error)
        process.exit(1)
      }
    },
  )
  .showHelpOnFail(false)
  .help()

instance.parse()
