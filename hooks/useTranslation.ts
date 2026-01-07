import { useCallback } from 'react';
import { aiService } from '../services/aiService';

export interface TranslationResult {
  translatedText: string;
  detectedLanguage: string;
}

export const useTranslation = () => {
  const translateText = useCallback(async (text: string, targetLanguage: string): Promise<TranslationResult | null> => {
    try {
      const result = await aiService.translate(text, targetLanguage);
      if (!result) return null;
      return result as TranslationResult;
    } catch (error) {
      console.error("[YOLO Translation] Error:", error);
      return null;
    }
  }, []);

  return { translateText };
};