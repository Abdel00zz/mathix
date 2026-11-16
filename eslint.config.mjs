import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/**',
      'scripts/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // App Router root layout loads Google Fonts with <link> so offline builds never depend on network
    files: ['src/app/layout.tsx'],
    rules: {
      '@next/next/no-page-custom-font': 'off',
    },
  },
];

export default eslintConfig;
