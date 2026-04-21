import { GoogleGenAI } from "@google/genai";

// Initialize the Gemini API client
// The API key is automatically injected by the AI Studio environment
export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});
