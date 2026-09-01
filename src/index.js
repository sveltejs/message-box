/** @import { Message } from './types' */

/**
 * Extract structured data from a markdown file containing messages
 * @param {string} markdown
 */
export function parse(markdown) {
	/** @type {Set<string>} */
	const seen = new Set();

	/** @type {Message[]} */
	const messages = [];

	for (const match of markdown.matchAll(/#+ (.+?)\n\n([^]+?)(?=$|\n\n#+ )/g)) {
		const [_, code, text] = match;

		if (seen.has(code)) {
			throw new Error(`Duplicate message code ${code}`);
		}

		const sections = text.trim().split('\n\n');
		const details = [];

		while (!sections[sections.length - 1].startsWith('> ')) {
			details.unshift(/** @type {string} */ (sections.pop()));
		}

		if (sections.length === 0) {
			throw new Error('No message text');
		}

		/** @type {Set<string>} */
		const variables = new Set();

		seen.add(code);
		messages.push({
			code,
			variants: sections.map((section) => {
				for (const match of section.matchAll(/%(.+?)%/g)) {
					variables.add(match[1]);
				}

				return {
					text: section.replace(/^> /gm, '').replace(/^>\n/gm, '\n'),
					variables: Array.from(variables)
				};
			}),
			details: details.join('\n\n').trim() || undefined
		});
	}

	return messages;
}

/**
 * @param {Message} message
 * @param {string} template A code snippet with CODE/MESSAGE/PARAMETER placeholders
 * @returns {string}
 */
export function render(message, template) {
	const values = new Set();

	for (const variant of message.variants) {
		if (variant.variables.length === 0) {
			values.add('void');
		} else {
			values.add(
				`{ ${variant.variables.map((v) => `${JSON.stringify(v)}: string`).join(', ')} }`
			);
		}
	}

	return template
		.replaceAll('CODE', () => message.code)
		.replaceAll('DESCRIPTION', () => message.variants[0].text)
		.replaceAll('VALUES', () => Array.from(values).join(' | '))
		.replace(/MESSAGE\(([a-zA-Z_$][a-zA-Z0-9_$]*)\)/g, (m, name) => {
			return render_expression(message, name);
		})
		.replaceAll('MESSAGE', () => {
			return `((_) => ${render_expression(message, '_')})`;
		});
}

/**
 * @param {Message} message
 * @param {string} name
 */
function render_expression(message, name) {
	let expression = '``';
	let previous_variables;

	for (let i = 0; i < message.variants.length; i += 1) {
		const { text, variables } = message.variants[i];

		if (variables.length === 0) {
			expression = `\`${text.replace(/(`|\${)/g, '\\$1')}\``;
			previous_variables = variables;
			continue;
		}

		const parts = text.split(/(%\w+%)/);

		let result = '`';

		for (let i = 0; i < parts.length; i += 1) {
			const part = parts[i];
			if (i % 2 === 0) {
				const str = part.replace(/(`|\${)/g, '\\$1');
				result += str;
			} else {
				result += `\${${name}.${part.slice(1, -1)}}`;
			}
		}

		result += '`';

		if (previous_variables) {
			if (variables.length === previous_variables.length) {
				throw new Error('Message overloads must have new parameters');
			}

			expression = `(${name}?.${variables[previous_variables.length]} !== undefined ? ${result} : ${expression})`;
		} else {
			expression = result;
		}

		previous_variables = variables;
	}

	return expression;
}
