import type { Message } from './types';
/**
 * @param {Object} options
 * @param {string} options.markdown The markdown representing the messages
 * @param {string} options.template A JavaScript module with CODE/MESSAGE/PARAMETER placeholders
 * @returns {{ module: string, messages: Message[] }}
 */
export declare function generate(options: {
    markdown: string;
    template: string;
}): {
    module: string;
    messages: Message[];
};
