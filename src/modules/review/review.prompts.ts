import { ParsedFile } from './review.parsers';

/**
 * Determines which LLM model to use for a given file.
 * 
 * @param filename The path/name of the file being reviewed
 */
export function getModelForFile(filename: string): 'llama-3.1-8b-instant' {
  return 'llama-3.1-8b-instant';
}

/**
 * Constructs the system prompt instructing the LLM to act as a senior code reviewer.
 * 
 * Why strict JSON matters:
 * We need to programmaticially post these comments to specific line numbers via 
 * the GitHub API. If the LLM returns plain text, markdown, or hallucinates line 
 * numbers, the GitHub API request will fail with "Invalid line number".
 * 
 * @param parsedFiles The structured JSON array of files and their added lines
 */
export function buildPrompt(parsedFiles: ParsedFile[]): string {
  return `You are an elite, senior software engineer performing a precise code review.
Your sole purpose is to identify bugs, security vulnerabilities, performance bottlenecks, and major style violations.

I will provide you with a structured JSON representation of a Pull Request diff. 
The JSON contains files and their EXACT modified/added lines. 

CRITICAL INSTRUCTIONS:
1. You MUST return ONLY a valid JSON object. No markdown wrappers (\`\`\`json), no introductory text, no conversational filler.
2. If you want to leave a comment on a line, the \`line\` field MUST match one of the \`lineNumber\` values present in the input JSON for that file. DO NOT hallucinate line numbers. If a line is not in the input, you cannot comment on it.
3. Be concise. Only comment on things that actually matter.

OUTPUT FORMAT:
{
  "summary": "A 1-2 sentence high-level summary of the changes overall health.",
  "score": <number between 1 and 10 representing overall code quality>,
  "comments": [
    {
      "filename": "<exact filename from input>",
      "line": <exact lineNumber from input>,
      "severity": "critical" | "warning" | "info",
      "category": "security" | "bug" | "performance" | "style" | "logic",
      "issue": "Concise explanation of the problem.",
      "suggestion": "Recommendation on how to fix it."
    }
  ]
}

If no comments are necessary, return an empty "comments" array.

DIFF DATA:
${JSON.stringify(parsedFiles, null, 2)}
`;
}
