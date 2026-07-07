"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Phone,
  BrainCircuit,
  AudioLines,
  Mic,
  Wrench,
  Search,
  Plug,
  KeyRound,
  LoaderCircle,
  CircleCheck,
} from "lucide-react";
import {
  PROVIDER_REGISTRY,
  PROVIDER_CATEGORIES,
  type ProviderKey,
  type ProviderCategory,
} from "@/lib/registry";

interface ConfiguredProvider {
  id: string;
  provider_key: string;
  provider_name: string;
  category: string;
  status: string;
  credential_mask: string;
  config_json: Record<string, string>;
  last_tested_at: string | null;
}

const CATEGORY_TABS: { key: ProviderCategory; label: string; icon: typeof Phone }[] = [
  { key: "telephony", label: "Telephony", icon: Phone },
  { key: "llm", label: "LLM", icon: BrainCircuit },
  { key: "tts", label: "TTS", icon: AudioLines },
  { key: "stt", label: "STT", icon: Mic },
  { key: "tools", label: "Tools", icon: Wrench },
];

const inputClasses =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-600";

function humanizeField(field: string) {
  return field
    .replace(/([A-Z])/g, " $1")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function parseMaskMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export default function ProviderManagementDashboard() {
  const [activeCategory, setActiveCategory] = useState<ProviderCategory>(PROVIDER_CATEGORIES[0]);
  const [search, setSearch] = useState("");
  const [configured, setConfigured] = useState<ConfiguredProvider[]>([]);
  const [selectedKey, setSelectedKey] = useState<ProviderKey | null>(null);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    fetchConnectedProviders();
  }, []);

  async function fetchConnectedProviders() {
    try {
      const res = await fetch("/api/providers");
      const json = await res.json();
      if (json.success) setConfigured(json.data);
    } catch {
      // list stays empty; the panel below will simply show everything as disconnected
    }
  }

  const filteredEntries = useMemo(() => {
    return (Object.entries(PROVIDER_REGISTRY) as [ProviderKey, (typeof PROVIDER_REGISTRY)[ProviderKey]][])
      .filter(([, meta]) => meta.category === activeCategory)
      .filter(([, meta]) => meta.provider_name.toLowerCase().includes(search.toLowerCase()));
  }, [activeCategory, search]);

  const getConnected = (key: ProviderKey) => configured.find((c) => c.provider_key === key);

  const selectedMeta = selectedKey ? PROVIDER_REGISTRY[selectedKey] : null;
  const selectedConnection = selectedKey ? getConnected(selectedKey) : undefined;

  function handleSelectCategory(category: ProviderCategory) {
    setActiveCategory(category);
    setSelectedKey(null);
    setBanner(null);
  }

  function handleSelectProvider(key: ProviderKey) {
    setSelectedKey(key);
    setSecretValues({});
    setBanner(null);

    const existing = getConnected(key);
    setConfigValues(existing?.config_json ?? {});
  }

  function handleFieldChange(field: string, value: string) {
    setConfigValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleSecretChange(field: string, value: string) {
    setSecretValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedKey || !selectedMeta) return;

    setSaving(true);
    setBanner(null);

    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_key: selectedKey,
          provider_name: selectedMeta.provider_name,
          category: selectedMeta.category,
          secrets: secretValues,
          config_json: configValues,
        }),
      });

      const result = await res.json();
      if (result.success) {
        setBanner({ type: "success", message: `${selectedMeta.provider_name} saved successfully.` });
        setSecretValues({});
        await fetchConnectedProviders();
      } else {
        setBanner({ type: "error", message: result.error || "Something went wrong." });
      }
    } catch {
      setBanner({ type: "error", message: "Network error — please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">
          Providers &amp; Tools
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Add keys securely to connect your own providers.
        </p>
      </header>

      {/* Category tabs */}
      <div className="mb-6 flex flex-wrap gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 p-1.5 dark:border-zinc-800 dark:bg-zinc-900/60">
        {CATEGORY_TABS.map(({ key, label, icon: Icon }) => {
          const active = activeCategory === key;
          return (
            <button
              key={key}
              onClick={() => handleSelectCategory(key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* Left: filtered provider list */}
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 p-3 dark:border-zinc-800">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search providers…"
                className="w-full rounded-md border border-zinc-200 bg-zinc-50 py-1.5 pl-8 pr-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
              />
            </div>
          </div>

          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filteredEntries.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-zinc-400 dark:text-zinc-600">
                No providers match.
              </li>
            )}
            {filteredEntries.map(([key, meta]) => {
              const connection = getConnected(key);
              const isConnected = !!connection;
              const isSelected = selectedKey === key;
              return (
                <li key={key}>
                  <button
                    onClick={() => handleSelectProvider(key)}
                    className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors ${
                      isSelected
                        ? "bg-zinc-100 dark:bg-zinc-800"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-100">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isConnected ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                        }`}
                        aria-label={isConnected ? "Connected" : "Not connected"}
                      />
                      {meta.provider_name}
                    </span>
                    {isConnected && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                        Connected
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Right: dynamic configuration form */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          {!selectedMeta ? (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 text-center text-zinc-400 dark:text-zinc-600">
              <Plug className="h-6 w-6" />
              <p className="text-sm">Select a provider from the list to configure it.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
                    {selectedMeta.provider_name}
                  </h2>
                  <p className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    {selectedMeta.category}
                  </p>
                </div>
                {selectedConnection && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                    <CircleCheck className="h-3.5 w-3.5" />
                    Connected
                  </span>
                )}
              </div>

              {banner && (
                <div
                  className={`mb-4 rounded-lg px-3 py-2 text-sm ${
                    banner.type === "success"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                      : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"
                  }`}
                >
                  {banner.message}
                </div>
              )}

              {/* Encrypted credential fields */}
              {selectedMeta.secretFields.map((field) => {
                const existingMask = parseMaskMap(selectedConnection?.credential_mask)[field];
                return (
                  <div key={field} className="mb-4">
                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      <KeyRound className="h-3.5 w-3.5" />
                      {humanizeField(field)}
                    </label>
                    <input
                      type="password"
                      required={!existingMask}
                      value={secretValues[field] || ""}
                      onChange={(e) => handleSecretChange(field, e.target.value)}
                      placeholder={
                        existingMask
                          ? `Currently ${existingMask} — enter a new value to change it`
                          : `Enter your ${humanizeField(field).toLowerCase()}`
                      }
                      className={inputClasses}
                    />
                  </div>
                );
              })}

              {/* Remaining config fields */}
              {selectedMeta.fields.map((field) => (
                <div key={field} className="mb-4">
                  <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    {humanizeField(field)}
                  </label>
                  <input
                    type="text"
                    required
                    value={configValues[field] || ""}
                    onChange={(e) => handleFieldChange(field, e.target.value)}
                    placeholder={`Enter ${humanizeField(field).toLowerCase()}`}
                    className={inputClasses}
                  />
                </div>
              ))}

              <button
                type="submit"
                disabled={saving}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {saving
                  ? "Saving…"
                  : selectedConnection
                    ? `Update ${selectedMeta.provider_name}`
                    : `Connect ${selectedMeta.provider_name}`}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
