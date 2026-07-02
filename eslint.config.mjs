import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**', '**/.next/**'],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Financial code: unawaited promises are a bug class, not a style issue.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Test stubs are often async-without-await to satisfy handler signatures.
    files: ['**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },
);
