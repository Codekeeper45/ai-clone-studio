import React from 'react';
import { Sparkles, BarChart3, AlertTriangle, CheckCircle } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { AIServiceRouter } from '../../services/AIServiceRouter';

export function AIProcessing() {
  const { state, actions } = useAppContext();

  const estimatedCost = React.useMemo(() => {
    const router = new AIServiceRouter(state.aiConfig);
    return router.estimateCost(state.processedMessages.length);
  }, [state.processedMessages.length, state.aiConfig]);

  const handleStartCleaning = () => {
    if (!state.aiConfig.apiKey) {
      actions.addNotification('error', 'API Key Required', 'Please configure your API key in Settings.');
      return;
    }
    actions.startCleaning();
  };

  const getQualityScoreClass = (score: number) => {
    if (score >= 75) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  };

  return (
    <div className="processing-container">
      <div className="page-header">
        <h1>AI Processing</h1>
        <p>Clean data, analyze style, and audit quality using AI</p>
      </div>

      {/* AI Data Cleaning Card */}
      <div className="card">
        <div className="card-header">
          <Sparkles className="icon" />
          <h2>AI Data Cleaning</h2>
        </div>
        <div className="card-body">
          <div className="cost-estimate">
            Estimated cost: ${estimatedCost.toFixed(4)}
          </div>

          <div className="button-group">
            {!state.isCleaningActive ? (
              <button
                className="btn-primary"
                data-testid="clean-start-btn"
                onClick={handleStartCleaning}
                disabled={state.isCleaningActive || !state.aiConfig.apiKey}
              >
                <Sparkles className="icon" />
                Start Cleaning
              </button>
            ) : (
              <button
                className="btn-danger"
                data-testid="clean-cancel-btn"
                onClick={actions.cancelCleaning}
              >
                Cancel
              </button>
            )}
          </div>

          {state.isCleaningActive && (
            <div className="progress-bar" data-testid="clean-progress">
              <div
                className="progress-bar-fill"
                style={{ width: `${state.cleaningProgress}%` }}
              ></div>
            </div>
          )}

          {state.cleanedSamples.length > 0 && !state.isCleaningActive && (
            <div className="badge badge-success" data-testid="clean-sample-count">
              <CheckCircle className="icon" />
              {state.cleanedSamples.length} samples generated
            </div>
          )}
        </div>
      </div>

      {/* Style Analysis Card */}
      <div className="card">
        <div className="card-header">
          <BarChart3 className="icon" />
          <h2>Style Analysis</h2>
        </div>
        <div className="card-body">
          <button
            className="btn-primary"
            data-testid="style-analyze-btn"
            onClick={actions.analyzeStyle}
            disabled={!state.aiConfig.apiKey || state.processedMessages.length === 0}
          >
            <BarChart3 className="icon" />
            Analyze Style
          </button>

          {state.styleAnalysis && (
            <div className="analysis-grid">
              <div className="analysis-item">
                <div className="label">Tone</div>
                <div className="value">{state.styleAnalysis.tone}</div>
              </div>

              <div className="analysis-item">
                <div className="label">Vocabulary Level</div>
                <div className="value">{state.styleAnalysis.vocabularyLevel}</div>
              </div>

              <div className="analysis-item">
                <div className="label">Humor Style</div>
                <div className="value">{state.styleAnalysis.humorStyle}</div>
              </div>

              <div className="analysis-item full-width">
                <div className="label">Typical Topics</div>
                <div className="tag-list">
                  {state.styleAnalysis.typicalTopics.map((topic, idx) => (
                    <span key={idx} className="tag">
                      {topic}
                    </span>
                  ))}
                </div>
              </div>

              <div className="analysis-item full-width">
                <div className="label">Unique Phrases</div>
                <div className="tag-list">
                  {state.styleAnalysis.uniquePhrases.map((phrase, idx) => (
                    <span key={idx} className="tag">
                      {phrase}
                    </span>
                  ))}
                </div>
              </div>

              <div className="analysis-item">
                <div className="label">Confidence</div>
                <div className="badge badge-info">
                  {(state.styleAnalysis.confidence * 100).toFixed(0)}%
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quality Audit Card */}
      <div className="card">
        <div className="card-header">
          <CheckCircle className="icon" />
          <h2>Quality Audit</h2>
        </div>
        <div className="card-body">
          <button
            className="btn-primary"
            data-testid="quality-audit-btn"
            onClick={actions.auditQuality}
            disabled={state.cleanedSamples.length === 0}
          >
            <CheckCircle className="icon" />
            Run Audit
          </button>

          {state.qualityReport && (
            <div className="quality-report">
              <div className={`quality-score ${getQualityScoreClass(state.qualityReport.score)}`}>
                <div className="score-value" data-testid="quality-score-value">{state.qualityReport.score}</div>
                <div className="score-label" data-testid="quality-score-label">Quality Score</div>
              </div>

              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-label">Sample Count</div>
                  <div className="stat-value">{state.qualityReport.sampleCount}</div>
                </div>

                <div className="stat-item">
                  <div className="stat-label">Avg Message Length</div>
                  <div className="stat-value">
                    {state.qualityReport.avgMessageLength.toFixed(0)} chars
                  </div>
                </div>

                <div className="stat-item">
                  <div className="stat-label">Diversity</div>
                  <div className="stat-value">
                    {(state.qualityReport.conversationDiversity * 100).toFixed(0)}%
                  </div>
                </div>

                <div className="stat-item">
                  <div className="stat-label">Role Balance</div>
                  <div className="stat-value">
                    {(state.qualityReport.roleBalance * 100).toFixed(0)}%
                  </div>
                </div>
              </div>

              {state.qualityReport.warnings.length > 0 && (
                <div className="warnings-section">
                  <h3>
                    <AlertTriangle className="icon icon-warning" />
                    Warnings
                  </h3>
                  <ul className="warnings-list">
                    {state.qualityReport.warnings.map((warning, idx) => (
                      <li key={idx}>
                        <AlertTriangle className="icon icon-warning" />
                        {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {state.qualityReport.recommendations.length > 0 && (
                <div className="recommendations-section">
                  <h3>
                    <CheckCircle className="icon icon-success" />
                    Recommendations
                  </h3>
                  <ul className="recommendations-list">
                    {state.qualityReport.recommendations.map((rec, idx) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
