// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'lib',
    pnpm: true,
  },
  {
    files: ['src/cli.ts', 'src/commands/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
)
