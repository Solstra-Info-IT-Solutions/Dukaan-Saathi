import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['src/database.types.ts'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', 'expo*', '@supabase/*', 'next', 'next/*'],
              message: 'contracts must stay platform-free.',
            },
          ],
        },
      ],
    },
  },
);
