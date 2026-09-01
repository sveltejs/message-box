// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, render } from '../src/index.js';

Error.stackTraceLimit = Infinity;

/**
 * @param {string} str
 */
function deindent(str) {
	const indentation = /^[ \t]+/m.exec(str)?.[0] ?? '';
	const regex = new RegExp(`^${indentation}`, 'gm');

	return str.replace(regex, '').trim();
}

test('parses a simple message', () => {
	const markdown = deindent(`
		## foo

		> This is the foo message

		Here are some details about foo
	`);

	const messages = parse(markdown);

	assert.deepEqual(messages, [
		{
			code: 'foo',
			variants: [
				{
					text: 'This is the foo message',
					variables: []
				}
			],
			details: 'Here are some details about foo'
		}
	]);
});

test('parses a message with variables', () => {
	const markdown = deindent(`
		## foo

		> This message includes \`%stuff%\`
	`);

	const messages = parse(markdown);

	assert.deepEqual(messages[0].variants[0].variables, ['stuff']);
});

test('parses a message with multiple variants', () => {
	const markdown = deindent(`
		## foo

		> This variant has no variables

		> This variant has \`%stuff%\`
	`);

	const messages = parse(markdown);

	assert.deepEqual(messages[0].variants, [
		{
			text: 'This variant has no variables',
			variables: []
		},
		{
			text: 'This variant has `%stuff%`',
			variables: ['stuff']
		}
	]);
});

test('renders a function', () => {
	const markdown = deindent(`
		## foo

		> Hello stranger

		> Hello %name%
	`);

	const [message] = parse(markdown);

	const template = deindent(`
		/**
		 * @param {VALUES} values
		 */
		function CODE(values) {
			return {
				message: MESSAGE(values)
			};
		}
	`);

	const code = render(message, template);
	const fn = new Function(`${code}\n\nreturn foo`)();

	assert.ok(code.includes('@param {void | { "name": string }} values'));

	assert.deepEqual(fn(), {
		message: 'Hello stranger'
	});

	assert.deepEqual(fn({ name: 'world' }), {
		message: 'Hello world'
	});
});

test('correctly replaces with $$', () => {
	const markdown = deindent(`
		## foo$$

		> $$ behaves weirdly with replaceAll if you're not careful

		Always use the function form instead of passing a string containing $$ as the second argument
	`);

	const [message] = parse(markdown);

	const template = deindent(`
		/**
		 * DESCRIPTION
		 * @param {VALUES} values
		 */
		function CODE(values) {
			return {
				message: MESSAGE(values)
			};
		}
	`);

	const code = render(message, template);

	const expected = deindent(`
		/**
		 * $$ behaves weirdly with replaceAll if you're not careful
		 * @param {void} values
		 */
		function foo$$(values) {
			return {
				message: \`$$ behaves weirdly with replaceAll if you're not careful\`
			};
		}
	`);

	assert.deepEqual(code, expected);
});
