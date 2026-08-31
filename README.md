# message-box

A utility for turning markdown containing diagnostic messages...

```md
## unrecognised_option

> Received an unrecognised option

Valid options are `color` and `size`

## invalid_color

> `%color%` is not a valid hex code

Colors must be expressed as six-digit hex codes, like `'#ff3e00'`
```

...and function templates...

```js
/**
 * DESCRIPTION
 * @param {VALUES} values
 * @returns {never}
 */
export function CODE(values) {
	const error = new Error(`${MESSAGE(values)}\nhttps://example.com/e/${'CODE'}`)
	error.code = 'CODE';
	throw error;
}
```

...into structured data...

```json
[
	{
		"code": "unrecognised_option",
		"variants": [
			{
				"text": "Received an unrecognised option",
				"variables": []
			}
		],
		"details": "Valid options are `color` and `size`"
	},
	{
		"code": "invalid_color",
		"variants": [
			{
				"text": "`%color%` is not a valid color",
				"variables": ["color"]
			}
		],
		"details": "Colors must be expressed as six-digit hex codes, like `'#ff3e00'`"
	}
]
```

...and functions:

```js
/**
 * Received an unrecognised option
 * @param {void} values
 * @returns {never}
 */
export function unrecognised_option(values) {
	const error = new Error(`${'Received an unrecognised option'}\nhttps://example.com/e/${'unrecognised_option'}`)
	error.code = 'unrecognised_option';
	throw error;
}

/**
 * `%color%` is not a valid color
 * @param {{ color: string }} values
 * @returns {never}
 */
export function invalid_color(values) {
	const error = new Error(`${((_) => `${_.color} is not a valid color`)(values)}\nhttps://example.com/e/${'invalid_color'}`)
	error.code = 'invalid_color';
	throw error;
}
```

## Usage

```js
import fs from 'node:fs';
import { parse, render } from '@sveltejs/message-box';

const markdown = fs.readFileSync('errors.md', 'utf-8');
const template = fs.readFileSync('template.js', 'utf-8');

const messages = parse(markdown);
const module = messages.map((message) => render(message, template)).join('\n\n');

fs.writeFileSync('src/messages/errors.js', module);
```

You can now use the generated functions like a regular JavaScript module, with typechecking, treeshaking (e.g. for dev-only errors and warnings) and so on.

```ts
import { DEV } from 'esm-env';
import * as e from './errors.js';

/**
 * Render some text
 * @param {string} text
 * @param {{ color: string, size: number }} options
 */
export function renderText(text, options) {
	const { color, size, ...rest } = options;

	if (DEV && Object.keys(rest).length > 0) {
		e.unrecognised_option();
	}

	if (!/#[0-9a-f]{6}/i.test(color)) {
		e.invalid_color({ color });
	}

	// ...
}
```

## Message structure

The markdown should contain a list of messages, where each message begins with an `<h2>` containing the message `code`...

```md
## my_message_code
```

...followed by one or more blockquotes containing the message `variants`, in order of increasing arity:

```md
> This is a variant without any variables

> This is a variant with a %foo% variable

> This is a variant with %foo% and %bar% variables
```

Any additional content before the next heading (such as a detailed explanation of the message, suitable for inclusion in documentation) is stored as the message `details`.

The variant is selected based on which values are provided — for example if a function generated from the variants above is called with `{ foo: '...' }` but no `bar`, then the second variant will be selected.

## Replacements

The following strings are replaced inside the template:

- `CODE` is derived from the header
- `DESCRIPTION` is the text of the first variant, suitable for inclusion in (for example) a JSDoc comment
- `VALUES` is the type of an object containing variables, suitable for use as a type annotation
- `MESSAGE` is a function that, given a `VALUES` object, returns a rendered string

## License

[MIT](LICENSE.md)
