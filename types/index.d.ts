/** @import { Message } from './types.js' */
import type { Message } from './types.js';
/**
 * Extract structured data from a markdown file containing messages
 * @param {string} markdown
 */
export declare function parse(markdown: string): Message[];
/**
 * @param {Message} message
 * @param {string} template A code snippet with CODE/MESSAGE/PARAMETER placeholders
 * @returns {string}
 */
export declare function render(message: Message, template: string): string;
