module.exports = {
	"parserOptions": {
		"ecmaVersion": 8,
		"ecmaFeatures": {
			"impliedStrict": true,
			experimentalObjectRestSpread: true
		}
	},
	"globals": {
		"describe": false,
		"expect": false,
		"it": false,
		"test": false
	},
	"extends": ["eslint:recommended"],
	"env": {
		"node": true,
		"es6": true
	},
	"rules": {
		"class-methods-use-this": 2,
		"comma-dangle": 2,
		"comma-spacing": 2,
		"eqeqeq": 2,
		"indent": [ 2, "tab", { "SwitchCase": 1 } ],
		"key-spacing": 2,
		"max-len": [ 2, 200, 2 ],
		"no-alert": 2,
		"no-console": 0,
		"no-multiple-empty-lines": 2,
		"no-var": 2,
		"padded-blocks": [ 2, "never" ],
		"prefer-const": 2,
		"prefer-arrow-callback": 2,
		"require-await": 2,
		"semi": [ 2, "always" ],
		"space-before-function-paren": [ 2, { "anonymous": "always", "named": "never" } ],
		"space-infix-ops": 0,
		"yoda": 2
	}
};
