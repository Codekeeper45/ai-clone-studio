import React, { useState } from 'react';
import { Cpu, Play, Zap } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { TrainingConfig, DEFAULT_TRAINING_CONFIG, TRAINING_MODELS } from '../../types';

export function TrainingPanel() {
  const { state, actions } = useAppContext();
  const [config, setConfig] = useState<TrainingConfig>(DEFAULT_TRAINING_CONFIG);
  const [familyFilter, setFamilyFilter] = useState<string>('all');

  const families = ['all', ...new Set(TRAINING_MODELS.map(m => m.family))];
  const filteredModels = familyFilter === 'all'
    ? TRAINING_MODELS
    : TRAINING_MODELS.filter(m => m.family === familyFilter);

  const selectedModel = TRAINING_MODELS.find(m => m.id === config.baseModel);

  const handleStartTraining = () => {
    if (!state.modalConfig?.tokenId || !state.modalConfig?.tokenSecret || !state.modalConfig?.endpoint) {
      actions.addNotification('error', 'Modal Not Configured', 'Please configure your Modal.com credentials and endpoint URL in Settings first.');
      return;
    }
    if (!state.processedMessages.length) {
      actions.addNotification('error', 'No Data', 'Please import and process data first.');
      return;
    }
    actions.startTraining(config);
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'completed': return 'badge badge-success';
      case 'running': return 'badge badge-info';
      case 'failed': return 'badge badge-error';
      case 'queued': return 'badge badge-warning';
      default: return 'badge';
    }
  };

  const truncateJobId = (jobId: string) =>
    jobId.length > 16 ? `${jobId.substring(0, 16)}...` : jobId;

  const isModalConfigured = state.modalConfig?.tokenId && state.modalConfig?.tokenSecret && state.modalConfig?.endpoint;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fine-Tuning</h1>
        <p className="page-description">Train your AI clone on Modal.com with Unsloth</p>
      </div>

      {!isModalConfigured && (
        <div className="card" style={{ borderColor: 'var(--warning)', background: 'var(--warning-soft)' }}>
          <p style={{ color: 'var(--warning)', fontSize: 14 }}>
            Modal.com credentials not configured. Go to Settings to add your Token ID, Secret, and Endpoint URL.
          </p>
        </div>
      )}

      {/* Model Selection */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Base Model</h2>
            <p className="card-subtitle">Select a model for fine-tuning (QLoRA 4-bit via Unsloth)</p>
          </div>
        </div>

        <div className="flex gap-8 mb-16" style={{ flexWrap: 'wrap' }}>
          {families.map(f => (
            <button
              key={f}
              className={`btn btn-sm ${familyFilter === f ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFamilyFilter(f)}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {filteredModels.map(m => (
            <div
              key={m.id}
              className={`participant-chip ${config.baseModel === m.id ? 'selected' : ''}`}
              onClick={() => setConfig({ ...config, baseModel: m.id })}
              style={{ cursor: 'pointer', flexDirection: 'column', alignItems: 'flex-start', padding: '12px 16px' }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</div>
              <div className="flex gap-8 mt-8">
                <span className="badge badge-accent">{m.params}</span>
                <span className="badge badge-info">{m.family}</span>
              </div>
            </div>
          ))}
        </div>

        {selectedModel && (
          <div className="mt-16 text-sm text-muted">
            Selected: <strong style={{ color: 'var(--accent)' }}>{selectedModel.name}</strong> ({selectedModel.params} params, {selectedModel.family} family)
          </div>
        )}
      </div>

      {/* Training Parameters */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Training Parameters</h2>
            <p className="card-subtitle">Configure LoRA and training hyperparameters</p>
          </div>
        </div>

        <div className="training-config-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="lora-rank">LoRA Rank (4-128)</label>
            <input
              id="lora-rank"
              type="number"
              className="form-input"
              value={config.loraRank}
              onChange={e => setConfig({ ...config, loraRank: parseInt(e.target.value) })}
              min={4}
              max={128}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="lora-alpha">LoRA Alpha (8-256)</label>
            <input
              id="lora-alpha"
              type="number"
              className="form-input"
              value={config.loraAlpha}
              onChange={e => setConfig({ ...config, loraAlpha: parseInt(e.target.value) })}
              min={8}
              max={256}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="learning-rate">Learning Rate</label>
            <input
              id="learning-rate"
              type="number"
              className="form-input"
              value={config.learningRate}
              onChange={e => setConfig({ ...config, learningRate: parseFloat(e.target.value) })}
              step="0.0001"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="epochs">Epochs (1-10)</label>
            <input
              id="epochs"
              type="number"
              className="form-input"
              value={config.epochs}
              onChange={e => setConfig({ ...config, epochs: parseInt(e.target.value) })}
              min={1}
              max={10}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="batch-size">Batch Size (1-32)</label>
            <input
              id="batch-size"
              type="number"
              className="form-input"
              value={config.batchSize}
              onChange={e => setConfig({ ...config, batchSize: parseInt(e.target.value) })}
              min={1}
              max={32}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="gpu-type">GPU</label>
            <input
              id="gpu-type"
              type="text"
              className="form-input"
              value={state.modalConfig?.gpu || 'A10G'}
              disabled
              style={{ opacity: 0.7 }}
            />
            <p className="text-sm text-muted mt-8">Configured in Settings</p>
          </div>
        </div>

        <div className="mt-24">
          <button
            className="btn btn-primary btn-lg"
            onClick={handleStartTraining}
            disabled={!isModalConfigured || !state.processedMessages.length}
          >
            <Play size={18} />
            Start Training
          </button>
        </div>
      </div>

      {/* Training Jobs */}
      {state.trainingJobs.length > 0 ? (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Training Jobs</h2>
          </div>

          <div className="flex flex-col gap-16">
            {state.trainingJobs.map((job) => (
              <div key={job.jobId}>
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-12">
                    <Cpu size={20} />
                    <span style={{ fontFamily: 'monospace', fontSize: '14px' }}>
                      {truncateJobId(job.jobId)}
                    </span>
                    <span className="text-sm text-muted">
                      {TRAINING_MODELS.find(m => m.id === job.config.baseModel)?.name || job.config.baseModel}
                    </span>
                  </div>
                  <span className={getStatusBadgeClass(job.status)}>
                    {job.status}
                  </span>
                </div>

                {job.status === 'running' && (
                  <div className="mb-16">
                    <div className="progress-bar">
                      <div className="progress-bar-fill" style={{ width: `${job.progress}%` }} />
                    </div>
                    <div className="progress-label">
                      <span>Training progress</span>
                      <span>{job.progress}%</span>
                    </div>
                  </div>
                )}

                {job.metrics && (
                  <div className="stats-grid mb-16">
                    <div className="stat-card">
                      <div className="stat-value">{job.metrics.loss.toFixed(4)}</div>
                      <div className="stat-label">Loss</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{job.metrics.evalLoss.toFixed(4)}</div>
                      <div className="stat-label">Eval Loss</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{job.metrics.perplexity.toFixed(2)}</div>
                      <div className="stat-label">Perplexity</div>
                    </div>
                  </div>
                )}

                {job.logs.length > 0 && (
                  <div className="log-container mb-16">
                    {job.logs.map((log, index) => (
                      <div key={index} className={`log-entry ${log.level}`}>
                        [{new Date(log.timestamp).toLocaleTimeString()}] {log.message}
                      </div>
                    ))}
                  </div>
                )}

                {job.status === 'completed' && job.modelEndpoint && (
                  <div className="flex items-center gap-8 mt-16">
                    <Zap size={16} className="text-muted" />
                    <div>
                      <div className="text-sm text-muted">Model Endpoint</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--accent)' }}>
                        {job.modelEndpoint}
                      </div>
                    </div>
                  </div>
                )}

                {job.error && (
                  <div style={{
                    padding: '12px 16px',
                    background: 'var(--error-soft)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--error)',
                    fontSize: '14px',
                    marginTop: '16px'
                  }}>
                    {job.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <Cpu size={48} />
            </div>
            <div className="empty-state-text">No training jobs yet</div>
            <div className="empty-state-hint">
              Select a model and start training to begin
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
