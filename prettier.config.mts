export default {
	printWidth: 200,
	tabWidth: 4,
	useTabs: true,
	singleQuote: true,
	trailingComma: 'none',
	arrowParens: 'avoid',
	overrides: [
		{
			files: ['*.yml', '*.yaml'],
			options: {
				tabWidth: 2,
				useTabs: false
			}
		}
	]
};
