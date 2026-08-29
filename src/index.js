/** @import { Node } from 'esrap/languages/ts' */
/** @import * as ESTree from 'estree' */
/** @import { Message, Comment } from './types' */
import * as acorn from 'acorn';
import { walk } from 'zimmerframe';
import * as esrap from 'esrap';
import ts from 'esrap/languages/ts';

/**
 * @param {Object} options
 * @param {string} options.markdown The markdown representing the messages
 * @param {string} options.template A JavaScript module with CODE/MESSAGE/PARAMETER placeholders
 * @returns {{ module: string, messages: Message[] }}
 */
export function generate(options) {
	console.log(options);

	/** @type {Set<string>} */
	const seen = new Set();

	/** @type {Message[]} */
	const messages = [];

	for (const match of options.markdown.matchAll(/## ([\w]+)\n\n([^]+?)(?=$|\n\n## )/g)) {
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

		seen.add(code);
		messages.push({
			code,
			variants: sections.map((section) => section.replace(/^> /gm, '').replace(/^>\n/gm, '\n')),
			details: details.join('\n\n') || undefined
		});
	}

	messages.sort((a, b) => (a.code < b.code ? -1 : 1));

	console.log(messages);

	/** @type {Comment[]} */
	const comments = [];

	let ast = /** @type {ESTree.Node} */ (
		/** @type {unknown} */ (
			acorn.parse(options.template, {
				ecmaVersion: 'latest',
				sourceType: 'module',
				locations: true,
				onComment: comments
			})
		)
	);

	comments.forEach((comment) => {
		if (comment.type === 'Block') {
			comment.value = comment.value.replace(/^\t+/gm, '');
		}
	});

	ast = walk(ast, null, {
		Identifier(node, context) {
			if (node.name === 'CODES') {
				/** @type {ESTree.ArrayExpression} */
				const array = {
					type: 'ArrayExpression',
					elements: messages.map((message) => ({
						type: 'Literal',
						value: message.code
					}))
				};

				return array;
			}
		}
	});

	const body = /** @type {ESTree.Program} */ (ast).body;

	// find the `export function CODE` node
	const index = body.findIndex((node) => {
		if (
			node.type === 'ExportNamedDeclaration' &&
			node.declaration &&
			node.declaration.type === 'FunctionDeclaration'
		) {
			return node.declaration.id.name === 'CODE';
		}
	});

	if (index === -1) throw new Error(`missing export function CODE`);

	const template_node = body[index];
	body.splice(index, 1);

	const jsdoc = /** @type {Comment} */ (
		comments.findLast((comment) => comment.start < /** @type {number} */ (/** @type {acorn.Node} */ (template_node).start))
	);

	const printed = esrap.print(
		/** @type {Node} */ (ast),
		ts({
			comments: /** @type {import('esrap/languages/ts').Comment[]} */ (comments.filter((comment) => comment !== jsdoc))
		})
	);

	for (const message of messages) {
		/** @type {string[]} */
		const vars = [];

		const group = message.variants.map((text, i) => {
			for (const match of text.matchAll(/%(\w+)%/g)) {
				const name = match[1];
				if (!vars.includes(name)) {
					vars.push(match[1]);
				}
			}

			return {
				text,
				vars: vars.slice()
			};
		});

		/** @type {ESTree.Expression} */
		let expression = { type: 'Literal', value: '' };
		let prev_vars;

		for (let i = 0; i < group.length; i += 1) {
			const { text, vars } = group[i];

			if (vars.length === 0) {
				expression = {
					type: 'Literal',
					value: text
				};
				prev_vars = vars;
				continue;
			}

			const parts = text.split(/(%\w+%)/);

			/** @type {ESTree.Expression[]} */
			const expressions = [];

			/** @type {ESTree.TemplateElement[]} */
			const quasis = [];

			for (let i = 0; i < parts.length; i += 1) {
				const part = parts[i];
				if (i % 2 === 0) {
					const str = part.replace(/(`|\${)/g, '\\$1');
					quasis.push({
						type: 'TemplateElement',
						value: { raw: str, cooked: str },
						tail: i === parts.length - 1
					});
				} else {
					expressions.push({
						type: 'Identifier',
						name: part.slice(1, -1)
					});
				}
			}

			/** @type {ESTree.Expression} */
			const template_expression = {
				type: 'TemplateLiteral',
				expressions,
				quasis
			};

			if (prev_vars) {
				if (vars.length === prev_vars.length) {
					throw new Error('Message overloads must have new parameters');
				}

				expression = {
					type: 'ConditionalExpression',
					test: {
						type: 'Identifier',
						name: vars[prev_vars.length]
					},
					consequent: template_expression,
					alternate: expression
				};
			} else {
				expression = template_expression;
			}

			prev_vars = vars;
		}

		const clone = /** @type {ESTree.Statement} */ (
			walk(/** @type {ESTree.Node} */ (template_node), null, {
				FunctionDeclaration(node, context) {
					if (node.id.name !== 'CODE') return;

					const params = [];

					for (const param of node.params) {
						if (param.type === 'Identifier' && param.name === 'PARAMETER') {
							params.push(...vars.map((name) => ({ type: 'Identifier', name })));
						} else {
							params.push(param);
						}
					}

					return /** @type {ESTree.FunctionDeclaration} */ ({
						.../** @type {ESTree.FunctionDeclaration} */ (context.next()),
						params,
						id: {
							...node.id,
							name: message.code
						}
					});
				},
				TemplateLiteral(node, context) {
					/** @type {ESTree.TemplateElement} */
					let quasi = {
						type: 'TemplateElement',
						value: {
							...node.quasis[0].value
						},
						tail: node.quasis[0].tail
					};

					/** @type {ESTree.TemplateLiteral} */
					let out = {
						type: 'TemplateLiteral',
						quasis: [quasi],
						expressions: []
					};

					for (let i = 0; i < node.expressions.length; i += 1) {
						const q = structuredClone(node.quasis[i + 1]);
						const e = node.expressions[i];

						if (e.type === 'Literal' && e.value === 'CODE') {
							quasi.value.raw += message.code + q.value.raw;
							continue;
						}

						if (e.type === 'Identifier' && e.name === 'MESSAGE') {
							if (expression.type === 'Literal') {
								const str = /** @type {string} */ (expression.value).replace(/(`|\${)/g, '\\$1');
								quasi.value.raw += str + q.value.raw;
								continue;
							}

							if (expression.type === 'TemplateLiteral') {
								const m = structuredClone(expression);
								quasi.value.raw += m.quasis[0].value.raw;
								out.quasis.push(...m.quasis.slice(1));
								out.expressions.push(...m.expressions);
								quasi = m.quasis[m.quasis.length - 1];
								quasi.value.raw += q.value.raw;
								continue;
							}
						}

						out.quasis.push((quasi = q));
						out.expressions.push(/** @type {ESTree.Expression} */ (context.visit(e)));
					}

					return out;
				},
				Literal(node) {
					if (node.value === 'CODE') {
						return {
							type: 'Literal',
							value: message.code
						};
					}
				},
				Identifier(node) {
					if (node.name !== 'MESSAGE') return;
					return expression;
				}
			})
		);

		const jsdoc_clone = jsdoc && {
			...jsdoc,
			value: /** @type {string} */ (jsdoc.value)
				.split('\n')
				.map((line) => {
					if (line === ' * MESSAGE') {
						return message.variants[message.variants.length - 1]
							.split('\n')
							.map((line) => ` * ${line}`)
							.join('\n');
					}

					if (line.includes('PARAMETER')) {
						return vars
							.map((name, i) => {
								const optional = i >= group[0].vars.length;

								return optional
									? ` * @param {string | undefined | null} [${name}]`
									: ` * @param {string} ${name}`;
							})
							.join('\n');
					}

					return line;
				})
				.filter((x) => x !== '')
				.join('\n')
		};

		const block = esrap.print(
			/** @type {ESTree.Program} */ ({ ...ast, body: [clone] }),
			ts({ comments: /** @type {import('esrap/languages/ts').Comment[]} */ (jsdoc_clone ? [jsdoc_clone] : []) })
		).code;

		printed.code += `\n\n${block}`;

		body.push(clone);
	}

	return {
		module: printed.code,
		messages
	};
}
