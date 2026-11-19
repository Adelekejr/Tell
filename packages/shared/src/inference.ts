/**
 * Where an answer came from. Model answers are either on-device (Gemini Nano
 * in Chrome) or in the cloud (Gemini through Firebase AI Logic). Results that
 * code decided, such as rule hits and canary hits, are "rules".
 */
export type AnswerSource = 'on-device' | 'cloud' | 'rules';

export const CLOUD_MODEL = 'gemini-3.5-flash-lite';
export const DEVICE_MODEL_LABEL = 'Gemini Nano';
