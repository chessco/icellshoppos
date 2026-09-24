import { requireNativeModule } from "expo-modules-core";

export interface OcrRecognitionResult {
  rawText: string;
  lines: string[];
}

let nativeModule: {
  isAvailable(): boolean;
  recognizeText(imageUri: string): Promise<OcrRecognitionResult>;
} | null = null;

try {
  nativeModule = requireNativeModule("AppleVisionOcr");
} catch {
  nativeModule = null;
}

export function isAvailable(): boolean {
  if (!nativeModule) return false;
  try {
    return Boolean(nativeModule.isAvailable());
  } catch {
    return false;
  }
}

export async function recognizeText(imageUri: string): Promise<OcrRecognitionResult> {
  if (!nativeModule || !isAvailable()) {
    throw new Error("Apple Vision OCR is not available in the current environment (Expo Go or non-iOS).");
  }
  return await nativeModule.recognizeText(imageUri);
}

export default {
  isAvailable,
  recognizeText,
};
