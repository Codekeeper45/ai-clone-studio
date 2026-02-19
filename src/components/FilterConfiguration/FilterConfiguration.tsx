import React, { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { FilterConfig } from '../../types';

const FilterConfiguration: React.FC = () => {
  const { state, actions } = useAppContext();

  const [localConfig, setLocalConfig] = useState<FilterConfig>(state.filterConfig);
  const [prevFilterConfig, setPrevFilterConfig] = useState<FilterConfig>(state.filterConfig);

  // Sync local config if global config changes (e.g. from loading a dataset)
  if (state.filterConfig !== prevFilterConfig) {
    setPrevFilterConfig(state.filterConfig);
    setLocalConfig(state.filterConfig);
  }

  const handleApplyFilters = () => {
    actions.applyFilters(localConfig);
  };

  const handleMinLengthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0;
    setLocalConfig({ ...localConfig, minMessageLength: value });
  };

  const handleMergeBurstToggle = () => {
    setLocalConfig({ ...localConfig, mergeBurstMessages: !localConfig.mergeBurstMessages });
  };

  const handleFilterLazyToggle = () => {
    setLocalConfig({ ...localConfig, filterLazyResponses: !localConfig.filterLazyResponses });
  };

  const handleIdentityGuardToggle = () => {
    setLocalConfig({ ...localConfig, enableIdentityGuard: !localConfig.enableIdentityGuard });
  };

  const handleLazyPatternsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const patterns = e.target.value.split(',').map(p => p.trim()).filter(p => p.length > 0);
    setLocalConfig({ ...localConfig, lazyPatterns: patterns });
  };

  const totalMessages = state.rawMessages.length;
  const afterFiltersCount = state.processedMessages.length;

  return (
    <div className="filter-configuration" data-testid="filter-configuration">
      <div className="filter-card">
        <h3 className="card-title">Filter Configuration</h3>

        <div className="form-group">
          <label className="form-label" htmlFor="min-length">Minimum Message Length</label>
          <input
            id="min-length"
            type="number"
            className="form-input"
            data-testid="filter-min-length"
            value={localConfig.minMessageLength}
            onChange={handleMinLengthChange}
            min="0"
          />
          <p className="form-hint">Messages shorter than this will be filtered out</p>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="merge-burst">Merge Burst Messages</label>
          <button
            id="merge-burst"
            className={`toggle ${localConfig.mergeBurstMessages ? 'active' : ''}`}
            data-testid="filter-merge-burst"
            onClick={handleMergeBurstToggle}
            aria-pressed={localConfig.mergeBurstMessages}
          >
            <span className="toggle-switch"></span>
          </button>
          <p className="form-hint">Combine consecutive messages from the same sender</p>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="filter-lazy">Filter Lazy Responses</label>
          <button
            id="filter-lazy"
            className={`toggle ${localConfig.filterLazyResponses ? 'active' : ''}`}
            data-testid="filter-lazy-toggle"
            onClick={handleFilterLazyToggle}
            aria-pressed={localConfig.filterLazyResponses}
          >
            <span className="toggle-switch"></span>
          </button>
          <p className="form-hint">Remove short, low-effort responses</p>
        </div>

        {localConfig.filterLazyResponses && (
          <div className="form-group">
            <label className="form-label" htmlFor="lazy-patterns">Lazy Patterns (comma-separated)</label>
            <textarea
              id="lazy-patterns"
              className="form-input"
              data-testid="filter-lazy-patterns"
              rows={4}
              value={localConfig.lazyPatterns.join(', ')}
              onChange={handleLazyPatternsChange}
              placeholder="ok, lol, yes, no, k, etc."
            />
            <p className="form-hint">Messages matching these patterns will be filtered</p>
          </div>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="identity-guard">Enable Identity Guard</label>
          <button
            id="identity-guard"
            className={`toggle ${localConfig.enableIdentityGuard ? 'active' : ''}`}
            data-testid="filter-identity-guard"
            onClick={handleIdentityGuardToggle}
            aria-pressed={localConfig.enableIdentityGuard}
          >
            <span className="toggle-switch"></span>
          </button>
          <p className="form-hint">Filter out messages containing personal information</p>
        </div>

        <button
          className="btn btn-primary btn-block"
          data-testid="filter-apply-btn"
          onClick={handleApplyFilters}
        >
          Apply Filters
        </button>
      </div>

      <div className="stats-display">
        <div className="stat-row">
          <span className="stat-label">Total Messages:</span>
          <span className="stat-value">{totalMessages}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">After Filters:</span>
          <span className="stat-value">{afterFiltersCount}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Filtered Out:</span>
          <span className="stat-value">{totalMessages - afterFiltersCount}</span>
        </div>
      </div>
    </div>
  );
};

export default FilterConfiguration;
