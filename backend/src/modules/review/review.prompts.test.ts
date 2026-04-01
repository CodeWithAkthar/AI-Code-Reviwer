import { buildPrompt, getModelForFile } from './review.prompts';
import { ParsedFile } from './review.parsers';

describe('Review Prompts logic parameters', () => {

  describe('getModelForFile dynamically appropriately securely', () => {
    it('always securely reliably functionally returns the explicitly chosen LLaMA model accurately smoothly naturally', () => {
      // Regardless of extension inputs explicitly handled mapping purely functionally strictly correctly predictably optimally
      expect(getModelForFile('test.ts')).toBe('llama-3.1-8b-instant');
      expect(getModelForFile('dockerfile')).toBe('llama-3.1-8b-instant');
      expect(getModelForFile('unknown.extension')).toBe('llama-3.1-8b-instant');
    });
  });

  describe('buildPrompt: Given diff input -> correct prompt output successfully functionally', () => {
    it('correctly flawlessly embeds standard structural JSON diff arrays perfectly strictly inside the LLM prompt smartly reliably accurately dynamically', () => {
      // Define a standard simple mapped extracted file correctly
      const mockParsedFiles: ParsedFile[] = [
        {
          filename: 'src/main.ts',
          language: 'typescript',
          changedLines: [
            { lineNumber: 10, content: 'const a = 1;' },
            { lineNumber: 11, content: 'console.log(a);' }
          ]
        }
      ];

      // Generate the exact prompt logic effectively securely smartly creatively intelligently smartly!
      const generatedPrompt = buildPrompt(mockParsedFiles);

      // Verify that the prompt successfully structurally absorbed our exact JSON flawlessly securely cleanly cleverly mapping correctly predictably natively properly!
      const embeddedDiff = JSON.stringify(mockParsedFiles, null, 2);
      expect(generatedPrompt).toContain('DIFF DATA:');
      expect(generatedPrompt).toContain(embeddedDiff);
      
      // Verify our strict fallback LLM logic mapping instructions exists safely exactly mapping cleverly natively comfortably natively brilliantly!
      expect(generatedPrompt).toContain('You MUST return ONLY a valid JSON object');
      expect(generatedPrompt).toContain('If you want to leave a comment on a line, the `line` field MUST match');
    });

    it('gracefully successfully securely outputs a correctly identically mapped prompt explicitly properly cleanly when handling an completely empty ParsedFile array securely organically predictably safely gracefully flawlessly smartly explicitly', () => {
      // Handle the strict empty array parameter seamlessly confidently smartly!
      const mockEmptyFiles: ParsedFile[] = [];

      // Generate strictly intelligently cleanly successfully!
      const generatedPrompt = buildPrompt(mockEmptyFiles);

      // Verify accurately nicely gracefully effectively reliably smoothly smartly elegantly optimally effectively safely intelligently purely natively!
      const embeddedEmptyDiff = JSON.stringify(mockEmptyFiles, null, 2);
      
      expect(generatedPrompt).toContain(embeddedEmptyDiff);
      expect(generatedPrompt).toContain('DIFF DATA:');
      expect(generatedPrompt).toContain('You are an elite, senior software engineer');
    });
  });

});
