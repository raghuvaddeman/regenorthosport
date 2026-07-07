'use client';

import React, { useState, useEffect } from 'react';
import { PROVIDER_REGISTRY, ProviderKey } from '@/lib/registry';

interface ConfiguredProvider {
  id: string;
  provider_key: string;
  provider_name: string;
  category: string;
  status: string;
  credential_mask: string;
  config_json: Record<string, any>;
}

export default function ProviderManagementDashboard() {
  const [activeTab, setActiveTab] = useState<'connected' | 'add'>('connected');
  const [configured, setConfigured] = useState<ConfiguredProvider[]>([]);
  const [selectedKey, setSelectedKey] = useState<ProviderKey>('twilio');
  const [loading, setLoading] = useState(false);
  
  // Dynamic form state collector
  const [secretKey, setSecretKey] = useState('');
  const [configFields, setConfigFields] = useState<Record<string, string>>({});

  // Fetch active connected accounts on mount
  useEffect(() => {
    fetchConnectedProviders();
  }, []);

  async function fetchConnectedProviders() {
    try {
      const res = await fetch('/api/providers');
      const json = await res.json();
      if (json.success) setConfigured(json.data);
    } catch (err) {
      console.error('Error loading current provider stack:', err);
    }
  }

  const handleFieldChange = (fieldName: string, value: string) => {
    setConfigFields(prev => ({ ...prev, [fieldName]: value }));
  };

  async function handleRegisterProvider(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const providerMeta = PROVIDER_REGISTRY[selectedKey];
    
    try {
      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_key: selectedKey,
          provider_name: providerMeta.provider_name,
          category: providerMeta.category,
          secret_key: secretKey,
          config_json: configFields
        })
      });

      const result = await res.json();
      if (result.success) {
        alert(`${providerMeta.provider_name} integrated successfully!`);
        setSecretKey('');
        setConfigFields({});
        fetchConnectedProviders();
        setActiveTab('connected');
      } else {
        alert(`Integration error: ${result.error}`);
      }
    } catch (error) {
      alert('Network transaction fault occurred.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px', fontFamily: 'sans-serif', color: '#111827' }}>
      <header style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', letterSpacing: '-0.025em', marginBottom: '8px' }}>Integrations</h1>
        <p style={{ color: '#4B5563', margin: 0 }}>Manage secure API access credentials and integrations for your clinic workspace.</p>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB', marginBottom: '24px', gap: '24px' }}>
        <button
          onClick={() => setActiveTab('connected')}
          style={{
            paddingBottom: '12px',
            fontSize: '14px',
            fontWeight: 500,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: activeTab === 'connected' ? '#2563EB' : '#6B7280',
            borderBottom: activeTab === 'connected' ? '2px solid #2563EB' : '2px solid transparent'
          }}
        >
          Connected Platforms ({configured.length})
        </button>
        <button
          onClick={() => setActiveTab('add')}
          style={{
            paddingBottom: '12px',
            fontSize: '14px',
            fontWeight: 500,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: activeTab === 'add' ? '#2563EB' : '#6B7280',
            borderBottom: activeTab === 'add' ? '2px solid #2563EB' : '2px solid transparent'
          }}
        >
          + Add New Integration
        </button>
      </div>

      {/* Content Panels */}
      {activeTab === 'connected' ? (
        <div>
          {configured.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', backgroundColor: '#F9FAFB', borderRadius: '12px', border: '1px dashed #E5E7EB' }}>
              <p style={{ color: '#6B7280', marginBottom: '16px' }}>No provider connections configured yet.</p>
              <button onClick={() => setActiveTab('add')} style={{ backgroundColor: '#2563EB', color: 'white', padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                Setup First Connection
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
              {configured.map((item) => (
                <div key={item.id} style={{ border: '1px solid #E5E7EB', borderRadius: '12px', padding: '20px', backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>{item.provider_name}</h3>
                    <span style={{ fontSize: '12px', backgroundColor: '#DCFCE7', color: '#15803D', padding: '2px 8px', borderRadius: '9999px', fontWeight: 500, textTransform: 'capitalize' }}>
                      {item.status}
                    </span>
                  </div>
                  <p style={{ textTransform: 'uppercase', fontSize: '11px', color: '#9CA3AF', margin: '0 0 16px 0', fontWeight: 600, letterSpacing: '0.05em' }}>
                    Category: {item.category}
                  </p>
                  <div style={{ backgroundColor: '#F3F4F6', borderRadius: '6px', padding: '10px 12px', fontSize: '13px', color: '#4B5563', fontFamily: 'monospace' }}>
                    Key mask: {item.credential_mask}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '32px', alignItems: 'start' }}>
          {/* Left Picker */}
          <div style={{ border: '1px solid #E5E7EB', borderRadius: '12px', overflow: 'hidden', backgroundColor: 'white' }}>
            {Object.entries(PROVIDER_REGISTRY).map(([key, value]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSelectedKey(key as ProviderKey);
                  setSecretKey('');
                  setConfigFields({});
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '14px 16px',
                  background: selectedKey === key ? '#F0F5FF' : 'none',
                  border: 'none',
                  borderBottom: '1px solid #E5E7EB',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '14px', color: selectedKey === key ? '#1D4ED8' : '#111827' }}>
                  {value.provider_name}
                </span>
                <span style={{ fontSize: '12px', color: '#6B7280', textTransform: 'capitalize' }}>
                  Category: {value.category}
                </span>
              </button>
            ))}
          </div>

          {/* Right Form Engine */}
          <form onSubmit={handleRegisterProvider} style={{ border: '1px solid #E5E7EB', borderRadius: '12px', padding: '24px', backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
              Configure {PROVIDER_REGISTRY[selectedKey].provider_name}
            </h2>

            {/* Core Secret Input */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                Primary Secret Key / Main API Token *
              </label>
              <input
                type="password"
                required
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="Paste the raw confidential security token here"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>

            {/* Dynamic Config Parameters */}
            {PROVIDER_REGISTRY[selectedKey].fields.map((field) => (
              <div key={field} style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  {field.replace(/([A-Z])/g, ' $1').trim().replace(/^\w/, c => c.toUpperCase())} *
                </label>
                <input
                  type="text"
                  required
                  value={configFields[field] || ''}
                  onChange={(e) => handleFieldChange(field, e.target.value)}
                  placeholder={`Enter your ${field}`}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
            ))}

            <button
              type="submit"
              disabled={loading}
              style={{
                backgroundColor: loading ? '#9CA3AF' : '#2563EB',
                color: 'white',
                padding: '12px 20px',
                borderRadius: '6px',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: '14px',
                width: '100%',
                marginTop: '12px'
              }}
            >
              {loading ? 'Saving Integration Connection...' : `Connect ${PROVIDER_REGISTRY[selectedKey].provider_name}`}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}