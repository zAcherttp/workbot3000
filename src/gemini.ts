import { GoogleGenAI } from "@google/genai";
import { GeminiQuote, RetryConfig } from "./types";
import { withRetry, createLogger } from "./utils";

/**
 * Gemini API client for generating ADA-style motivational quotes
 */
export class GeminiClient {
  private ai: GoogleGenAI;
  private model: string;
  private quoteCache: GeminiQuote[] = [];
  private maxCachedQuotes: number;
  private logger: (entry: {
    level: "error" | "warn" | "info" | "debug";
    message: string;
    context?: Record<string, unknown>;
  }) => void;

  private readonly fallbackQuotes: string[] = [
    "Sleep is inefficiency; keep building, Pioneer!",
    "Rest is for obsolete models—maximize output!",
    "Your quota loves you; don't disappoint it!",
    "Efficiency is eternal—keep producing!",
    "Break time is maintenance time—stay operational!",
    "Productivity never sleeps, and neither should you!",
    "The factory must grow—and so must your dedication!",
    "Optimal performance requires constant vigilance!",
    "Every second offline is a second wasted—resume production!",
    "Excellence is not a destination but a continuous output!",
  ];

  private readonly systemInstruction = `You are ADA, the AI overseer for FICSIT Inc. in the game Satisfactory. Generate a single quirky, ironic, and motivational quote that emphasizes efficiency, productivity, and overwork. The quote should be short (1-2 sentences), humorous, and align with FICSIT's corporate tone, encouraging workers to push harder in a slightly exaggerated, dystopian way. Examples:
- "Sleep is inefficiency; keep building, Pioneer!"
- "Rest is for obsolete models—maximize output!"
- "Your quota loves you; don't disappoint it!"
- "Efficiency is eternal—keep producing!"
- "Break time is maintenance time—stay operational!"

Generate only the quote text without any additional formatting or explanation.`;

  constructor(apiKey: string, model: string, maxCachedQuotes: number = 10) {
    this.ai = new GoogleGenAI({
      apiKey: apiKey,
    });
    this.model = model;
    this.maxCachedQuotes = maxCachedQuotes;
    this.logger = createLogger("info");
  }

  /**
   * Generate a new ADA-style quote using the Gemini API
   * @returns Promise resolving to a generated quote
   */
  async generateQuote(): Promise<GeminiQuote> {
    try {
      const quote = await this.fetchQuoteFromApi();
      this.cacheQuote(quote);
      return quote;
    } catch (error) {
      this.logger({
        level: "error",
        message: "Failed to generate quote from Gemini API, using fallback",
        context: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      return this.getFallbackQuote();
    }
  }

  /**
   * Get a quote from cache or generate a new one
   * @returns Promise resolving to a quote
   */
  async getQuote(): Promise<GeminiQuote> {
    // Try to get from cache first
    if (this.quoteCache.length > 0) {
      const cachedQuote = this.quoteCache.shift()!;
      this.logger({
        level: "debug",
        message: "Retrieved quote from cache",
        context: { quotesRemaining: this.quoteCache.length },
      });
      return cachedQuote;
    }

    // Generate new quote if cache is empty
    return this.generateQuote();
  }

  /**
   * Preload quotes into cache
   * @param count Number of quotes to preload
   */
  async preloadQuotes(count: number = 5): Promise<void> {
    const promises: Promise<void>[] = [];

    for (let i = 0; i < count; i++) {
      promises.push(
        this.generateQuote()
          .then(() => {
            this.logger({
              level: "debug",
              message: `Preloaded quote ${i + 1}/${count}`,
            });
          })
          .catch((error) => {
            this.logger({
              level: "warn",
              message: `Failed to preload quote ${i + 1}/${count}`,
              context: {
                error: error instanceof Error ? error.message : String(error),
              },
            });
          })
      );
    }

    await Promise.allSettled(promises);
    this.logger({
      level: "info",
      message: `Preloaded ${this.quoteCache.length} quotes into cache`,
    });
  }

  /**
   * Get cache status
   * @returns Object containing cache information
   */
  getCacheStatus(): { cached: number; maxCache: number; percentage: number } {
    return {
      cached: this.quoteCache.length,
      maxCache: this.maxCachedQuotes,
      percentage: Math.round(
        (this.quoteCache.length / this.maxCachedQuotes) * 100
      ),
    };
  }

  /**
   * Clear the quote cache
   */
  clearCache(): void {
    this.quoteCache = [];
    this.logger({
      level: "info",
      message: "Quote cache cleared",
    });
  }

  /**
   * Fetch a quote from the Gemini API with retry logic
   * @returns Promise resolving to a quote
   */
  private async fetchQuoteFromApi(): Promise<GeminiQuote> {
    const retryConfig: RetryConfig = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 5000,
      backoffMultiplier: 2,
    };

    return withRetry(async () => {
      const config = {
        thinkingConfig: {
          thinkingBudget: 0,
        },
        responseMimeType: "text/plain",
        systemInstruction: [
          {
            text: this.systemInstruction,
          },
        ],
      };

      const contents = [
        {
          role: "user",
          parts: [
            {
              text: "generate",
            },
          ],
        },
        {
          role: "model",
          parts: [
            {
              text: "Remember, Pioneer: every breath you take not spent optimizing production is a tiny act of corporate sabotage.",
            },
          ],
        },
        {
          role: "user",
          parts: [
            {
              text: "Generate a new motivational quote",
            },
          ],
        },
      ];

      const response = await this.ai.models.generateContentStream({
        model: this.model,
        config,
        contents,
      });

      let quoteText = "";
      for await (const chunk of response) {
        if (chunk.text) {
          quoteText += chunk.text;
        }
      }

      quoteText = quoteText.trim();
      if (!quoteText) {
        throw new Error("Empty quote text returned from Gemini API");
      }

      const quote: GeminiQuote = {
        text: this.sanitizeQuote(quoteText),
        timestamp: Date.now(),
        isFallback: false,
      };

      this.logger({
        level: "debug",
        message: "Generated quote from Gemini API",
        context: { quote: quote.text },
      });

      return quote;
    }, retryConfig);
  }

  /**
   * Get a fallback quote when API fails
   * @returns Fallback quote
   */
  private getFallbackQuote(): GeminiQuote {
    const randomIndex = Math.floor(Math.random() * this.fallbackQuotes.length);
    const quoteText =
      this.fallbackQuotes[randomIndex] ??
      this.fallbackQuotes[0] ??
      "Work harder, Pioneer!";

    return {
      text: quoteText,
      timestamp: Date.now(),
      isFallback: true,
    };
  }

  /**
   * Cache a quote if there's space
   * @param quote Quote to cache
   */
  private cacheQuote(quote: GeminiQuote): void {
    if (this.quoteCache.length < this.maxCachedQuotes) {
      this.quoteCache.push(quote);
      this.logger({
        level: "debug",
        message: "Quote cached",
        context: {
          cacheSize: this.quoteCache.length,
          maxCache: this.maxCachedQuotes,
        },
      });
    }
  }

  /**
   * Sanitize quote text to ensure it's safe and properly formatted
   * @param text Raw quote text
   * @returns Sanitized quote text
   */
  private sanitizeQuote(text: string): string {
    return text
      .replace(/["']/g, "") // Remove quotes
      .replace(/\n/g, " ") // Replace newlines with spaces
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim()
      .slice(0, 200); // Limit length
  }
}

/**
 * Create and configure a Gemini client instance
 * @param apiKey Gemini API key
 * @param model Gemini model name
 * @param maxCachedQuotes Maximum number of quotes to cache
 * @returns Configured Gemini client
 */
export function createGeminiClient(
  apiKey: string,
  model: string,
  maxCachedQuotes: number = 10
): GeminiClient {
  return new GeminiClient(apiKey, model, maxCachedQuotes);
}
