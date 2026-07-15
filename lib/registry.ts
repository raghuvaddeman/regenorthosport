export const PROVIDER_CATEGORIES = ["telephony", "llm", "tts", "stt", "tools"] as const;
export type ProviderCategory = (typeof PROVIDER_CATEGORIES)[number];

// A field is a plain text input (string), a dropdown with fixed options, or
// a dropdown whose options depend on the currently selected value of another
// field (e.g. TTS voice options differ per Sarvam model).
export type FieldDef =
  | string
  | { key: string; options: string[] }
  | { key: string; dependsOn: string; optionsByValue: Record<string, string[]> };

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
    // Verified against node_modules/@livekit/agents-plugin-google/dist/models.d.ts's
    // ChatModels union, plus gemini-3.1-flash-lite (agent/worker.ts's actual pinned
    // production default — confirmed via live call logs — which isn't in that type
    // list, since Google ships new model IDs faster than the plugin's types catch up).
    // Google deprecates model IDs without much notice (see AGENTS.md/commit history) —
    // re-verify this list periodically rather than trusting it indefinitely.
    fields: [
      {
        key: "model",
        options: [
          "gemini-3.1-flash-lite",
          "gemini-3.5-flash",
          "gemini-3-flash-preview",
          "gemini-3-pro-preview",
          "gemini-2.5-flash",
          "gemini-2.5-pro",
          "gemini-2.0-flash-001",
        ],
      },
    ] as FieldDef[]
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
    fields: [
      { key: "model", options: ["bulbul:v2", "bulbul:v3"] },
      {
        key: "voice",
        dependsOn: "model",
        optionsByValue: {
          "bulbul:v2": ["anushka", "manisha", "vidya", "arya", "abhilash", "karun", "hitesh"],
          "bulbul:v3": [
            "shubh", "aditya", "ritu", "priya", "neha", "rahul", "pooja", "rohan", "simran",
            "kavya", "amit", "dev", "ishita", "shreya", "ratan", "varun", "manan", "sumit",
            "roopa", "kabir", "aayan", "ashutosh", "advait", "amelia", "sophia", "anand",
            "tanya", "tarun", "sunny", "mani", "gokul", "vijay", "shruti", "suhani", "mohit",
            "kavitha", "rehan", "soham", "rupali"
          ]
        }
      }
    ] as FieldDef[]
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