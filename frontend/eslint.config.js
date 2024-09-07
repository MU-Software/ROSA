import cspellPlugin from '@cspell/eslint-plugin'
import eslint from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tslint from 'typescript-eslint'

export default tslint.config(
  { ignores: ['dist'] },
  {
    extends: [
      eslint.configs.recommended,
      ...tslint.configs.recommended,
      // importPlugin.flatConfigs.recommended,
      react.configs.flat.recommended,
      // reactHooks.configs.recommended,
      // 'plugin:prettier/recommended',
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parser: tslint.parser,
    },
    plugins: {
      // 'react': react.configs.flat.plugins,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      '@cspell': cspellPlugin,

    },
    settings: {
      // 'import/resolver': { typescript: {} },
      react: { version: 'detect' },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@cspell/spellchecker': ['error', { cspell: { words: ['packlint', 'codecov', 'tsup', 'rosa', 'poca'] } }],
      // 'import/no-duplicates': ['error', { 'prefer-inline': true }],
      // 'import/order': ['error', { alphabetize: { order: 'asc', caseInsensitive: false } }],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'react/react-in-jsx-scope': 'error',
      'react/prop-types': 'error',
      'sort-imports': ['error', { ignoreDeclarationSort: true }],
    },
  }
)
