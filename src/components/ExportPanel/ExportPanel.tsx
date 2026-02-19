import React from 'react';
import { Download } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';

export function ExportPanel() {
  const { state, actions } = useAppContext();

  const totalSamples = state.cleanedSamples.length > 0
    ? state.cleanedSamples.length
    : state.processedMessages.length;

  return (
    <div className="export-container">
      <div className="page-header">
        <h1>Export Dataset</h1>
        <p>Download your cleaned dataset in ShareGPT JSONL format</p>
      </div>

      <div className="card">
        <div className="card-header">
          <Download className="icon" />
          <h2>Export Summary</h2>
        </div>
        <div className="card-body">
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-label">Total Samples</div>
              <div className="stat-value">{totalSamples}</div>
            </div>

            <div className="stat-item">
              <div className="stat-label">Target User</div>
              <div className="stat-value">{state.targetUser || 'Not set'}</div>
            </div>

            <div className="stat-item">
              <div className="stat-label">Platform</div>
              <div className="stat-value">
                {state.platform ? state.platform.charAt(0).toUpperCase() + state.platform.slice(1) : 'Unknown'}
              </div>
            </div>

            <div className="stat-item">
              <div className="stat-label">Format</div>
              <div className="stat-value">ShareGPT JSONL</div>
            </div>
          </div>

          <button
            className="btn-primary btn-lg"
            data-testid="export-dataset-btn"
            onClick={actions.exportDataset}
            disabled={totalSamples === 0}
          >
            <Download className="icon" />
            Export & Download
          </button>
        </div>
      </div>
    </div>
  );
}
