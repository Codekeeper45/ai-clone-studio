import React, { useState, useEffect } from 'react';
import { Server, RefreshCw, Loader2 } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { AIConfig, ModalConfig, DEFAULT_MODAL_CONFIG } from '../../types';

interface FetchedModel {
  id: string;
  name: string;
}

const DEFAULT_OPENAI_BASE_URL =
  ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ?.VITE_OPENAI_BASE_URL || 'http://127.0.0.1:8045/v1').replace(/\/+$/, '');

interface GeminiModelResponse {
  supportedGenerationMethods?: string[];
  name: string;
  displayName?: string;
}

async function fetchGeminiModels(apiKey: string): Promise<FetchedModel[]> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || [])
      .filter((m: GeminiModelResponse) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: GeminiModelResponse) => ({
        id: m.name.replace('models/', ''),
        name: m.displayName || m.name.replace('models/', ''),
      }));
  } catch {
    return [];
  }
}

interface OpenAIModelResponse {
  id: string;
}

function normalizeEndpointInput(raw: string): string {
  const value = (raw || '').trim();
  if (!value) return DEFAULT_OPENAI_BASE_URL;
  const withScheme = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  try {
    return new URL(withScheme).toString().replace(/\/+$/, '');
  } catch {
    return withScheme.replace(/\/+$/, '');
  }
}

async function fetchOpenAIModels(apiKey: string, baseUrl: string): Promise<FetchedModel[]> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || [])
      .filter((m: OpenAIModelResponse) => typeof m.id === 'string' && m.id.trim().length > 0)
      .sort((a: OpenAIModelResponse, b: OpenAIModelResponse) => a.id.localeCompare(b.id))
      .map((m: OpenAIModelResponse) => ({ id: m.id, name: m.id }));
  } catch {
    return [];
  }
}

export function SettingsPanel() {
  const { state, actions } = useAppContext();

  const [localConfig, setLocalConfig] = useState<AIConfig>(state.aiConfig);
  const [modalConfig, setModalConfigLocal] = useState<ModalConfig>(state.modalConfig || DEFAULT_MODAL_CONFIG);
  const [availableModels, setAvailableModels] = useState<FetchedModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isInsecureCryptoMode, setIsInsecureCryptoMode] = useState(false);

  useEffect(() => {
    setLocalConfig(state.aiConfig);
  }, [state.aiConfig]);

  useEffect(() => {
    const secure = !!window.isSecureContext && !!window.crypto?.subtle;
    setIsInsecureCryptoMode(!secure);
  }, []);

  useEffect(() => {
    if (state.modalConfig) {
      setModalConfigLocal(state.modalConfig);
    }
  }, [state.modalConfig]);

  const fetchModels = async (provider?: string, apiKey?: string, endpoint?: string) => {
    const prov = provider || localConfig.provider;
    const key = apiKey || localConfig.apiKey;
    const baseUrl = normalizeEndpointInput(endpoint || localConfig.endpoint || DEFAULT_OPENAI_BASE_URL);
    if (!key) {
      actions.addNotification('warning', 'API Key Required', 'Enter your API key first to load models.');
      return;
    }

    setIsLoadingModels(true);
    try {
      const models = prov === 'gemini'
        ? await fetchGeminiModels(key)
        : await fetchOpenAIModels(key, baseUrl);

      if (models.length > 0) {
        setAvailableModels(models);
        actions.addNotification('success', 'Models Loaded', `Found ${models.length} available models.`);
      } else {
        const hint = prov === 'openai'
          ? `Could not fetch models from ${baseUrl}. Check endpoint/proxy, API key, and CORS.`
          : 'Could not fetch models. Check your API key.';
        actions.addNotification('warning', 'No Models', hint);
      }
    } catch {
      actions.addNotification('error', 'Fetch Error', 'Failed to fetch models from the API.');
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleProviderChange = (provider: 'gemini' | 'openai') => {
    const defaultModel = provider === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini';
    const endpoint =
      provider === 'openai'
        ? normalizeEndpointInput(localConfig.endpoint || DEFAULT_OPENAI_BASE_URL)
        : localConfig.endpoint;
    setLocalConfig({ ...localConfig, provider, model: defaultModel, endpoint });
    setAvailableModels([]);
  };

  const handleSaveAI = () => {
    const normalizedEndpoint =
      localConfig.provider === 'openai'
        ? normalizeEndpointInput(localConfig.endpoint || DEFAULT_OPENAI_BASE_URL)
        : localConfig.endpoint;

    if (localConfig.provider === 'openai') {
      try {
        new URL(normalizedEndpoint || '');
      } catch {
        actions.addNotification('error', 'Invalid Endpoint', 'Enter a valid endpoint URL, for example http://127.0.0.1:8045/v1');
        return;
      }
    }

    if (isInsecureCryptoMode && localConfig.apiKey) {
      const confirmed = window.confirm(
        'Secure Web Crypto is unavailable. API keys may be stored with reversible encoding in this environment. Continue saving anyway?'
      );
      if (!confirmed) {
        actions.addNotification('warning', 'Save Cancelled', 'AI settings were not saved.');
        return;
      }
    }

    actions.updateAIConfig({ ...localConfig, endpoint: normalizedEndpoint });
    actions.addNotification('success', 'Settings Saved', 'AI configuration updated.');
  };

  const handleSaveModal = () => {
    actions.updateModalConfig(modalConfig);
    actions.addNotification('success', 'Settings Saved', 'Modal.com configuration updated.');
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-description">Configure AI providers and Modal.com integration</p>
      </div>

      {/* AI Configuration */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">AI Configuration</h2>
            <p className="card-subtitle">Provider settings for data cleaning and analysis</p>
          </div>
        </div>
        <form onSubmit={e => { e.preventDefault(); handleSaveAI(); }}>

        <div className="settings-section">
          <div className="settings-section-title">Provider</div>
          <label htmlFor="ai-provider" className="sr-only">AI Provider</label>
          <select
            id="ai-provider"
            className="form-select"
            value={localConfig.provider}
            onChange={e => handleProviderChange(e.target.value as 'gemini' | 'openai')}
          >
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI</option>
          </select>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">API Key</div>
          <label htmlFor="ai-api-key" className="sr-only">API Key</label>
          <input
            id="ai-api-key"
            type="password"
            className="form-input"
            placeholder={`Enter your ${localConfig.provider === 'gemini' ? 'Google AI' : 'OpenAI'} API key`}
            value={localConfig.apiKey}
            onChange={e => setLocalConfig({ ...localConfig, apiKey: e.target.value })}
          />
          {isInsecureCryptoMode && (
            <p className="text-sm text-muted mt-8" role="alert">
              Warning: Secure browser crypto is unavailable. API key storage may be insecure in this environment.
            </p>
          )}
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Provider Endpoint</div>
          <label htmlFor="ai-endpoint" className="sr-only">Provider endpoint URL</label>
          <input
            id="ai-endpoint"
            type="text"
            className="form-input"
            placeholder="http://127.0.0.1:8045/v1"
            value={localConfig.endpoint || ''}
            onChange={e => setLocalConfig({ ...localConfig, endpoint: e.target.value })}
          />
          <p className="text-sm text-muted mt-8">
            OpenAI-compatible endpoint for proxy/local gateway. Default: {DEFAULT_OPENAI_BASE_URL}
          </p>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Model</div>
          <div className="flex gap-8 items-center">
            {availableModels.length > 0 ? (
              <>
                <label htmlFor="ai-model-select" className="sr-only">Select Model</label>
                <select
                  id="ai-model-select"
                  className="form-select"
                  value={localConfig.model}
                  onChange={e => setLocalConfig({ ...localConfig, model: e.target.value })}
                  style={{ flex: 1 }}
                >
                  {availableModels.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <label htmlFor="ai-model-input" className="sr-only">Model Name</label>
                <input
                  id="ai-model-input"
                  type="text"
                  className="form-input"
                  value={localConfig.model}
                  onChange={e => setLocalConfig({ ...localConfig, model: e.target.value })}
                  placeholder="Model name or click Fetch to load"
                  style={{ flex: 1 }}
                />
              </>
            )}
            <button
              className="btn btn-secondary"
              onClick={() => fetchModels(undefined, undefined, localConfig.endpoint)}
              disabled={isLoadingModels || !localConfig.apiKey}
              style={{ flexShrink: 0 }}
            >
              {isLoadingModels ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
              Fetch
            </button>
          </div>
          <p className="text-sm text-muted mt-8">
            Enter API key and click Fetch to load available models from the API
          </p>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Batch Size</div>
          <label htmlFor="ai-batch-size" className="sr-only">Batch Size</label>
          <input
            id="ai-batch-size"
            type="number"
            className="form-input"
            min="10"
            max="200"
            value={localConfig.batchSize}
            onChange={e => setLocalConfig({ ...localConfig, batchSize: parseInt(e.target.value, 10) })}
          />
          <p className="text-sm text-muted mt-8">Messages per API call (10-200)</p>
        </div>

        <button className="btn btn-primary" type="submit">
          Save AI Settings
        </button>
        </form>
      </div>

      {/* Modal.com Configuration */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Modal.com Configuration</h2>
            <p className="card-subtitle">Configure your Modal.com account for fine-tuning with Unsloth</p>
          </div>
          <Server size={20} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
        </div>
        <form onSubmit={e => { e.preventDefault(); handleSaveModal(); }}>

        <div className="settings-section">
          <div className="settings-section-title">Token ID</div>
          <label htmlFor="modal-token-id" className="sr-only">Token ID</label>
          <input
            id="modal-token-id"
            type="text"
            className="form-input"
            placeholder="ak-..."
            value={modalConfig.tokenId}
            onChange={e => setModalConfigLocal({ ...modalConfig, tokenId: e.target.value })}
          />
          <p className="text-sm text-muted mt-8">
            From modal.com/settings &rarr; API Tokens
          </p>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Token Secret</div>
          <label htmlFor="modal-token-secret" className="sr-only">Token Secret</label>
          <input
            id="modal-token-secret"
            type="password"
            className="form-input"
            placeholder="as-..."
            value={modalConfig.tokenSecret}
            onChange={e => setModalConfigLocal({ ...modalConfig, tokenSecret: e.target.value })}
          />
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Workspace</div>
          <label htmlFor="modal-workspace" className="sr-only">Workspace Name</label>
          <input
            id="modal-workspace"
            type="text"
            className="form-input"
            placeholder="your-workspace-name"
            value={modalConfig.workspace}
            onChange={e => setModalConfigLocal({ ...modalConfig, workspace: e.target.value })}
          />
        </div>

        <div className="settings-section">
          <div className="settings-section-title">GPU Type</div>
          <label htmlFor="modal-gpu" className="sr-only">Select GPU</label>
          <select
            id="modal-gpu"
            className="form-select"
            value={modalConfig.gpu}
            onChange={e => setModalConfigLocal({ ...modalConfig, gpu: e.target.value as ModalConfig['gpu'] })}
          >
            <option value="T4">NVIDIA T4 (16GB, budget)</option>
            <option value="A10G">NVIDIA A10G (24GB, recommended)</option>
            <option value="A100">NVIDIA A100 (40/80GB, fast)</option>
            <option value="H100">NVIDIA H100 (80GB, fastest)</option>
          </select>
          <p className="text-sm text-muted mt-8">
            A10G works for models up to ~14B. Use A100/H100 for 27B-32B models.
          </p>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Endpoint URL</div>
          <label htmlFor="modal-endpoint" className="sr-only">Modal Endpoint URL</label>
          <input
            id="modal-endpoint"
            type="text"
            className="form-input"
            placeholder="https://your-workspace--ai-clone-studio-api.modal.run"
            value={modalConfig.endpoint}
            onChange={e => setModalConfigLocal({ ...modalConfig, endpoint: e.target.value })}
          />
          <p className="text-sm text-muted mt-8">
            Your deployed Modal webhook URL. Run <code>modal deploy modal/api.py</code> to get it.
          </p>
        </div>

        <button className="btn btn-primary" type="submit">
          Save Modal Settings
        </button>
        </form>
      </div>
    </div>
  );
}
