module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'node_modules'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    'react/prop-types': 'off',
    'react-refresh/only-export-components': 'off',
  },
  overrides: [
    {
      // Tests use Vitest globals (`describe`, `it`, `expect`, `vi`) and the
      // jsdom-y `setup.js` shim. Mark them as such so eslint's no-undef
      // doesn't complain.
      files: [
        'src/**/*.{test,spec}.{js,jsx}',
        'src/test/**/*.{js,jsx}',
      ],
      env: { node: true },
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
  ],
}
