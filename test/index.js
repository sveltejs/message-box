import fs from 'node:fs';
import assert from 'node:assert/strict';
import { generate } from '../src/index.js';
import { fileURLToPath } from 'node:url';

const fixtures = fileURLToPath(new URL('./fixtures', import.meta.url));

Error.stackTraceLimit = Infinity;

for (const dir of fs.readdirSync(fixtures)) {
	const input = `${fixtures}/${dir}/input`;
	const output = `${fixtures}/${dir}/output`;
	const actual = `${fixtures}/${dir}/.actual`;

	const template = fs.readFileSync(`${input}/template.js`, 'utf-8');
	const markdown = fs.readFileSync(`${input}/messages.md`, 'utf-8');

	const { module, messages } = generate({ template, markdown });

	if (!fs.existsSync(actual)) fs.mkdirSync(actual);
	fs.writeFileSync(`${actual}/generated.js`, module);
	fs.writeFileSync(`${actual}/messages.json`, JSON.stringify(messages, null, '\t'));

	assert.equal(module, fs.readFileSync(`${output}/generated.js`, 'utf-8'));
	assert.deepEqual(messages, JSON.parse(fs.readFileSync(`${output}/messages.json`, 'utf-8')));
}
