export const PROVIDER_CATEGORIES = ["telephony", "llm", "tts", "stt", "tools"] as const;
export type ProviderCategory = (typeof PROVIDER_CATEGORIES)[number];

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
    fields: []
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
    fields: []
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