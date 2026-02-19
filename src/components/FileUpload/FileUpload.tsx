import React, { useState, useRef } from 'react';
import { Upload } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';

const FileUpload: React.FC = () => {
  const { state, actions } = useAppContext();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      actions.importFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      actions.importFile(files[0]);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const hasMessages = state.rawMessages.length > 0;

  const getDateRange = () => {
    if (state.rawMessages.length === 0) return 'N/A';

    const dates = state.rawMessages.map(m => new Date(m.timestamp).getTime());
    const start = new Date(Math.min(...dates));
    const end = new Date(Math.max(...dates));

    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  };

  return (
    <div className="file-upload-container">
      <div
        className={`file-drop-zone ${isDragging ? 'dragging' : ''}`}
        data-testid="upload-dropzone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <Upload size={48} className="file-drop-icon" />
        <h3 className="file-drop-title">Drop your chat export here</h3>
        <p className="file-drop-text">or click to browse</p>
        <p className="file-drop-hint">
          Supports Telegram JSON and WhatsApp TXT exports
        </p>
        <input
          ref={fileInputRef}
          type="file"
          data-testid="upload-input"
          accept=".json,.txt"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
      </div>

      {hasMessages && (
        <div className="import-stats-grid" data-testid="import-stats">
          <div className="stat-card">
            <div className="stat-label">Total Messages</div>
            <div className="stat-value" data-testid="stat-total-messages">{state.rawMessages.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Participants</div>
            <div className="stat-value" data-testid="stat-participants">{state.participants.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Platform</div>
            <div className="stat-value" data-testid="stat-platform">
              {state.platform ? state.platform.charAt(0).toUpperCase() + state.platform.slice(1) : 'N/A'}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Date Range</div>
            <div className="stat-value">{getDateRange()}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
