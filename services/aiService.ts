import { GoogleGenAI } from "@google/genai";

/**
 * AIService encapsulates all Gemini interactions.
 * It lazily initializes to avoid crashes if process.env is unstable.
 */
class AIService {
  private ai: GoogleGenAI | null = null;

 private getClient(): GoogleGenAI | null {
  if (this.ai) return this.ai;

  // ✅ Browser-safe Vite env access
  const apiKey =
    (import.meta as any)?.env?.VITE_GEMINI_API_KEY || '';

  if (!apiKey) {
    console.warn("[YOLO AI] No VITE_GEMINI_API_KEY found. AI features disabled.");
    return null;
  }

  try {
    this.ai = new GoogleGenAI({ apiKey });
    return this.ai;
  } catch (err) {
    console.error("[YOLO AI] Failed to initialize Gemini:", err);
    return null;
  }
}

  async generateFileSummary(fileName: string, mimeType: string): Promise<string> {
    const client = this.getClient();
    if (!client) return "Summary unavailable (AI Offline)";

    try {
      const response = await client.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Technical summary for file: ${fileName} (${mimeType}). Keep it under 20 words.`,
      });
      return response.text || "No summary generated.";
    } catch (err) {
      console.error("[YOLO AI] Summary generation failed:", err);
      return "Error generating summary.";
    }
  }

  async translate(text: string, targetLanguage: string) {
    const client = this.getClient();
    if (!client) return null;

    try {
      const response = await client.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Translate to ${targetLanguage}: "${text}". Return JSON with keys "translatedText" and "detectedLanguage".`,
        config: { responseMimeType: "application/json" }
      });
      return JSON.parse(response.text || "{}");
    } catch (err) {
      console.error("[YOLO AI] Translation failed:", err);
      return null;
    }
  }
}

export const aiService = new AIService();