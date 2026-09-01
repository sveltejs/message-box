export interface Message {
    /**
     * The message code, determined by the markdown header
     */
    code: string;
    /**
     * One or more message variants, authored as markdown blockquotes
     */
    variants: Array<{
        text: string;
        variables: string[];
    }>;
    /**
     * Any additional details that are excluded from the generated module,
     * but which may be used elsewhere (e.g. on a website)
     */
    details?: string;
}
