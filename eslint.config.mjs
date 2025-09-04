import tsEsLint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
  { files: ["/src/*.{ts}"] },
  ...tsEsLint.configs.strict,
  {
    rules: {
      'no-debugger': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-invalid-void-type': 'off',
      '@typescript-eslint/unified-signatures': 'off'
    }
  }
];