export const PROVIDER_REGISTRY = {
  twilio: { 
    category: "telephony", 
    provider_name: "Twilio",
    fields: ["accountSid", "authToken", "phoneNumber"] 
  },
  openai: { 
    category: "llm", 
    provider_name: "OpenAI",
    fields: ["apiKey"] 
  },
  azure_openai: { 
    category: "llm", 
    provider_name: "Azure OpenAI",
    fields: ["apiKey", "baseUrl", "region"] 
  },
  deepgram: { 
    category: "stt", 
    provider_name: "Deepgram",
    fields: ["apiKey"] 
  },
  elevenlabs: { 
    category: "tts", 
    provider_name: "ElevenLabs",
    fields: ["apiKey", "voiceId"] 
  },
  zoho_crm: { 
    category: "tools", 
    provider_name: "Zoho CRM",
    fields: ["clientId", "clientSecret", "refreshToken", "dataCenter", "organizationId", "baseApiUrl"] 
  }
} as const;

export type ProviderKey = keyof typeof PROVIDER_REGISTRY;