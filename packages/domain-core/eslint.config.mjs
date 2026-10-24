import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(js.configs.recommended, ...tseslint.configs.strict, {
  rules: {
    // domain-core must stay platform-free (CLEAN_ARCHITECTURE.md §1)
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          { group: ['react', 'react-*', 'expo*', '@supabase/*', 'next', 'next/*'], message: 'domain-core is pure TypeScript.' },
        ],
      },
    ],
  },
});
