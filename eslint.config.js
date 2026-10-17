import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['src/domain/**/*.ts', 'src/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'typeorm',
                'typeorm/*',
                '**/database/**',
                '@prisma/client',
                '@prisma/client/*',
              ],
              message:
                'El negocio y HTTP deben depender de contratos de repository y tipos de dominio, no de persistencia.',
            },
          ],
        },
      ],
    },
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
