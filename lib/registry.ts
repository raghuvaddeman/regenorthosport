export const PROVIDER_CATEGORIES = ["telephony", "llm", "tts", "stt", "tools"] as const;
export type ProviderCategory = (typeof PROVIDER_CATEGORIES)[number];

export const PROVIDER_REGISTRY = {
  vobiz: {
    category: "telephony",
    provider_name: "Vobiz",
    secretField: "apiKey",
    fields: ["phoneNumber"]
  },
  twilio: {
    category: "telephony",
    provider_name: "Twilio",
    secretField: "authToken",
    fields: ["accountSid", "phoneNumber"]
  },
  openai: {
    category: "llm",
    provider_name: "OpenAI",
    secretField: "apiKey",
    fields: []
  },
  azure_openai: {
    category: "llm",
    provider_name: "Azure OpenAI",
    secretField: "apiKey",
    fields: ["baseUrl", "region"]
  },
  elevenlabs: {
    category: "tts",
    provider_name: "ElevenLabs",
    secretField: "apiKey",
    fields: ["voiceId"]
  },
  sarvam_tts: {
    category: "tts",
    provider_name: "Sarvam",
    secretField: "apiKey",
    fields: []
  },
  deepgram: {
    category: "stt",
    provider_name: "Deepgram",
    secretField: "apiKey",
    fields: []
  },
  sarvam_stt: {
    category: "stt",
    provider_name: "Sarvam",
    secretField: "apiKey",
    fields: []
  },
  zoho_crm: {
    category: "tools",
    provider_name: "Zoho CRM",
    secretField: "clientSecret",
    fields: ["clientId", "refreshToken", "dataCenter", "organizationId", "baseApiUrl"]
  },
  salesforce: {
    category: "tools",
    provider_name: "Salesforce",
    secretField: "clientSecret",
    fields: ["clientId", "refreshToken", "instanceUrl"]
  },
  selldo: {
    category: "tools",
    provider_name: "Sell.Do",
    secretField: "apiKey",
    fields: ["baseUrl"]
  }
} as const;

export type ProviderKey = keyof typeof PROVIDER_REGISTRY;