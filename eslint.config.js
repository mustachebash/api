import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-plugin-prettier';
import tseslint from 'typescript-eslint';

export default [
	{
		ignores: ['dist/**']
	},
	{
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: {
				...globals.node
			}
		}
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		plugins: {
			prettier
		},
		rules: {
			'prettier/prettier': 'warn'
		}
	}
];
