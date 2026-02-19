import React, { useState, useEffect, useCallback } from 'react';
import { Database, Upload, Trash2, Download, RefreshCw } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { StorageManager } from '../../services/StorageManager';

interface DatasetListItem {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  targetUser: string;
}

export function DatasetManager() {
  const { actions } = useAppContext();
  const [datasets, setDatasets] = useState<DatasetListItem[]>([]);
  const [storageManager] = useState(() => new StorageManager());
  const [isProcessing, setIsProcessing] = useState(false);

  const loadDatasets = useCallback(async () => {
    try {
      const list = await storageManager.listDatasets();
      setDatasets(list);
    } catch (error) {
      console.error('Failed to load datasets:', error);
      actions.addNotification('error', 'Load Error', 'Failed to load saved datasets.');
    }
  }, [storageManager, actions]);

  useEffect(() => {
    let isMounted = true;

    const initialLoad = async () => {
      if (isMounted) {
        await loadDatasets();
      }
    };

    initialLoad();

    return () => {
      isMounted = false;
    };
  }, [loadDatasets]);

  const handleSave = async () => {
    const name = window.prompt('Enter a name for this dataset:');
    if (!name || name.trim() === '') {
      return;
    }

    try {
      await actions.saveDataset(name.trim());
      await loadDatasets();
    } catch (error) {
      console.error('Failed to save dataset:', error);
    }
  };

  const handleLoad = async (id: string) => {
    try {
      await actions.loadDataset(id);
    } catch (error) {
      console.error('Failed to load dataset:', error);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmed = window.confirm(`Are you sure you want to delete "${name}"?`);
    if (!confirmed) {
      return;
    }

    try {
      await actions.deleteDataset(id);
      await loadDatasets();
    } catch (error) {
      console.error('Failed to delete dataset:', error);
    }
  };

  const handleBackup = async () => {
    try {
      const json = await storageManager.exportAllData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-clone-studio-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      actions.addNotification('success', 'Backup Complete', 'All data exported successfully.');
    } catch (error) {
      console.error('Backup failed:', error);
      actions.addNotification('error', 'Backup Failed', 'Could not export data.');
    }
  };

  const handleRestore = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setIsProcessing(true);
      try {
        const text = await file.text();
        const result = await storageManager.importData(text);
        await loadDatasets();
        actions.addNotification('success', 'Restore Complete', `Successfully imported ${result.count} datasets.`);
      } catch (error) {
        console.error('Restore failed:', error);
        actions.addNotification('error', 'Restore Failed', error instanceof Error ? error.message : 'Unknown error');
      } finally {
        setIsProcessing(false);
      }
    };
    input.click();
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="dataset-manager-container">
      <div className="page-header">
        <h1>Saved Datasets</h1>
        <div className="flex gap-8">
          <button className="btn-secondary" onClick={handleBackup}>
            <Download size={16} className="icon" />
            Backup All
          </button>
          <button className="btn-secondary" onClick={handleRestore} disabled={isProcessing}>
            {isProcessing ? <RefreshCw size={16} className="icon spin" /> : <Upload size={16} className="icon" />}
            Restore
          </button>
          <button className="btn-primary" onClick={handleSave}>
            <Database size={16} className="icon" />
            Save Current
          </button>
        </div>
      </div>

      {datasets.length === 0 ? (
        <div className="empty-state">
          <Database className="icon icon-large" />
          <h3>No saved datasets</h3>
          <p>Save your current dataset to quickly resume work later.</p>
        </div>
      ) : (
        <div className="dataset-list">
          {datasets.map((dataset) => (
            <div key={dataset.id} className="dataset-item">
              <div className="dataset-info">
                <h3 className="dataset-name">{dataset.name}</h3>
                <div className="dataset-meta">
                  <span className="meta-item">
                    <Database className="icon" />
                    {dataset.messageCount} messages
                  </span>
                  <span className="meta-item">
                    Target: {dataset.targetUser}
                  </span>
                  <span className="meta-item">
                    {formatDate(dataset.createdAt)}
                  </span>
                </div>
              </div>
              <div className="dataset-actions">
                <button
                  className="btn-sm btn-secondary"
                  onClick={() => handleLoad(dataset.id)}
                >
                  <Upload className="icon" />
                  Load
                </button>
                <button
                  className="btn-sm btn-danger"
                  onClick={() => handleDelete(dataset.id, dataset.name)}
                >
                  <Trash2 className="icon" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
