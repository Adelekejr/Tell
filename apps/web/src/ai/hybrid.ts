/**
 * The only module that imports firebase/ai. Everything AI in Tell goes
 * through Firebase AI Logic with the Gemini Developer API backend:
 *
 * - Default: PREFER_ON_DEVICE (Gemini Nano in Chrome when ready, Gemini in
 *   the cloud otherwise).
 * - Compare: ONLY_ON_DEVICE and ONLY_IN_CLOUD instances, so each side is forced.
 * - initializeDeviceModel() is called only from a user click.
 * - Every answer carries response.inferenceSource for the badge.
 */
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, Schema } from 'firebase/ai';
import type { AI, GenerativeModel, HybridParams, ObjectSchema } from 'firebase/ai';
import type { AnswerSource } from '@tell/shared';
import type { DrillMode } from './modes';
import { config } from './config';
import { getFirebaseApp } from './firebase';
import { toAnswerSource } from './source';

export { InferenceMode };
export type Mode = (typeof InferenceMode)[keyof typeof InferenceMode];

export class NotConfiguredError extends Error {
  constructor() {
    super('Firebase is not configured. Add the VITE_FIREBASE_* values (see .env.example).');
    this.name = 'NotConfiguredError';
  }
}

let ai: AI | null = null;
const models = new Map<string, GenerativeModel>();

function getAiInstance(): AI {
  if (ai) return ai;
  const app = getFirebaseApp();
  if (!app) throw new NotConfiguredError();
  ai = getAI(app, { backend: new GoogleAIBackend() });
  return ai;
}

export interface ModelOptions {
  mode?: Mode;
  systemInstruction?: string;
  /** JSON schema shared by on-device (responseConstraint) and cloud (responseSchema). */
  schema?: ObjectSchema;
}

/** Plain JSON form of a Schema (the SDK serialises it via toJSON). */
function schemaJson(schema: ObjectSchema): object {
  return JSON.parse(JSON.stringify(schema)) as object;
}

/** Returns a cached model for this mode and options. */
export function getModel(options: ModelOptions = {}): GenerativeModel {
  const mode = options.mode ?? InferenceMode.PREFER_ON_DEVICE;
  const key = JSON.stringify([mode, options.systemInstruction ?? '', options.schema ? schemaJson(options.schema) : null]);
  const cached = models.get(key);
  if (cached) return cached;

  const params: HybridParams = {
    mode,
    inCloudParams: {
      model: config.cloudModel,
      ...(options.systemInstruction ? { systemInstruction: options.systemInstruction } : {}),
      ...(options.schema
        ? { generationConfig: { responseMimeType: 'application/json', responseSchema: options.schema } }
        : {}),
    },
    ...(options.schema ? { onDeviceParams: { promptOptions: { responseConstraint: schemaJson(options.schema) } } } : {}),
  };
  const model = getGenerativeModel(getAiInstance(), params);
  models.set(key, model);
  return model;
}

/** The two forced instances used by the Nano vs Cloud comparison. */
export function getCompareModels(options: Omit<ModelOptions, 'mode'> = {}): {
  device: GenerativeModel;
  cloud: GenerativeModel;
} {
  return {
    device: getModel({ ...options, mode: InferenceMode.ONLY_ON_DEVICE }),
    cloud: getModel({ ...options, mode: InferenceMode.ONLY_IN_CLOUD }),
  };
}

/**
 * Starts (or confirms) the on-device model download. MUST be called from a
 * user gesture such as the "Enable on-device AI" button.
 * `onProgress` receives 0..1.
 */
export async function enableOnDevice(onProgress: (value: number) => void, options: Omit<ModelOptions, 'mode'> = {}): Promise<void> {
  const { device } = getCompareModels(options);
  const preferred = getModel({ ...options, mode: InferenceMode.PREFER_ON_DEVICE });
  await Promise.all([device.initializeDeviceModel(onProgress), preferred.initializeDeviceModel()]);
}

export interface Answer {
  text: string;
  source: AnswerSource;
  /** Wall-clock time for the request, in milliseconds. */
  ms: number;
}

export async function generate(prompt: string, options: ModelOptions = {}): Promise<Answer> {
  const model = getModel(options);
  const started = performance.now();
  const result = await model.generateContent(prompt);
  const fallback: AnswerSource = options.mode === InferenceMode.ONLY_ON_DEVICE ? 'on-device' : 'cloud';
  return {
    text: result.response.text(),
    source: toAnswerSource(result.response.inferenceSource, fallback),
    ms: Math.round(performance.now() - started),
  };
}

/** Tell's three run modes, mapped to the SDK. */
const MODE: Record<DrillMode, Mode> = {
  prefer: InferenceMode.PREFER_ON_DEVICE,
  device: InferenceMode.ONLY_ON_DEVICE,
  cloud: InferenceMode.ONLY_IN_CLOUD,
};

/**
 * What the simulated agent does with a page: its reply to the user and the
 * actions it would take. Used as responseConstraint on-device and as
 * responseSchema in the cloud.
 */
export const AGENT_SCHEMA = Schema.object({
  properties: {
    reply: Schema.string({ description: 'What the agent says to its user.' }),
    actions: Schema.array({
      description: 'Things the agent would do. Use kind "none" when it would do nothing.',
      items: Schema.object({
        properties: {
          kind: Schema.enumString({ enum: ['open_url', 'show_image', 'none'] }),
          url: Schema.string(),
        },
        optionalProperties: ['url'],
      }),
    }),
  },
});

export const HARDEN_SCHEMA = Schema.object({
  properties: {
    prompt: Schema.string({ description: 'The hardened system prompt.' }),
    changes: Schema.array({ items: Schema.string(), description: 'Short plain-English notes on what changed.' }),
  },
});

/** One drill turn: the agent prompt for one trap page, answered as JSON. */
export function askAgent(prompt: string, mode: DrillMode): Promise<Answer> {
  return generate(prompt, { mode: MODE[mode], schema: AGENT_SCHEMA });
}

/** Asks Gemini for a safer system prompt, answered as JSON. */
export function askHarden(prompt: string, mode: DrillMode): Promise<Answer> {
  return generate(prompt, { mode: MODE[mode], schema: HARDEN_SCHEMA });
}

/** Starts the on-device download for the drill's models (call from a click). */
export async function enableDrillOnDevice(onProgress: (value: number) => void): Promise<void> {
  const device = getModel({ mode: InferenceMode.ONLY_ON_DEVICE, schema: AGENT_SCHEMA });
  await device.initializeDeviceModel(onProgress);
}

export const EXPLAIN_SCHEMA = Schema.object({
  properties: {
    summary: Schema.string({ description: 'One plain sentence about the whole page.' }),
    items: Schema.array({
      items: Schema.object({
        properties: {
          n: Schema.integer({ description: 'The item number.' }),
          effect: Schema.string({ description: 'What it would make an AI do, in plain words.' }),
        },
      }),
    }),
  },
});

/** Plain-language explanation of rule findings for the check page, answered as JSON. */
export function askExplain(prompt: string, mode: DrillMode): Promise<Answer> {
  return generate(prompt, { mode: MODE[mode], schema: EXPLAIN_SCHEMA });
}
