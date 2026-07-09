export const PROVIDER_CATEGORIES = ["telephony", "llm", "tts", "stt", "tools"] as const;
export type ProviderCategory = (typeof PROVIDER_CATEGORIES)[number];

// A field is either a plain text input (string) or a dropdown with preset
// options (used for model selection, so tenants pick from a known-good list
// instead of typing a model name that may not exist).
export type FieldDef = string | { key: string; options: string[] };

export const PROVIDER_REGISTRY = {
  vobiz: {
    category: "telephony",
    provider_name: "Vobiz",
    secretFields: ["authId", "authToken"],
    fields: ["phoneNumber"]
  },
  twilio: {
    category: "telephony",
    provider_name: "Twilio",
    secretFields: ["accountSid", "authToken"],
    fields: ["phoneNumber"]
  },
  openai: {
    category: "llm",
    provider_name: "OpenAI",
    secretFields: ["apiKey"],
    fields: []
  },
  azure_openai: {
    category: "llm",
    provider_name: "Azure OpenAI",
    secretFields: ["apiKey"],
    fields: ["baseUrl", "region"]
  },
  gemini: {
    category: "llm",
    provider_name: "Gemini",
    secretFields: ["apiKey"],
    fields: [{ key: "model", options: ["gemini-2.5-flash", "gemini-2.5-pro"] }] as FieldDef[]
  },
  elevenlabs: {
    category: "tts",
    provider_name: "ElevenLabs",
    secretFields: ["apiKey"],
    fields: ["voiceId"]
  },
  sarvam_tts: {
    category: "tts",
    provider_name: "Sarvam",
    secretFields: ["apiKey"],
    fields: [{ key: "model", options: ["bulbul:v2", "bulbul:v3"] }] as FieldDef[]
  },
  deepgram: {
    category: "stt",
    provider_name: "Deepgram",
    secretFields: ["apiKey"],
    fields: []
  },
  sarvam_stt: {
    category: "stt",
    provider_name: "Sarvam",
    secretFields: ["apiKey"],
    fields: [{ key: "model", options: ["saaras:v3", "saaras:v2.5", "saarika:v2.5"] }] as FieldDef[]
  },
  zoho_crm: {
    category: "tools",
    provider_name: "Zoho CRM",
    secretFields: ["clientSecret"],
    fields: ["clientId", "refreshToken", "dataCenter", "organizationId", "baseApiUrl"]
  },
  salesforce: {
    category: "tools",
    provider_name: "Salesforce",
    secretFields: ["clientSecret"],
    fields: ["clientId", "refreshToken", "instanceUrl"]
  },
  selldo: {
    category: "tools",
    provider_name: "Sell.Do",
    secretFields: ["apiKey"],
    fields: ["baseUrl"]
  }
} as const;

export type ProviderKey = keyof typeof PROVIDER_REGISTRY;