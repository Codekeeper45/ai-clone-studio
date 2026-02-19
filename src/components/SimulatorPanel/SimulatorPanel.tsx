import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, RotateCcw, Bot } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { SimulatorMessage, ModelInfo } from '../../types';
import { CloneSimulator } from '../../services/CloneSimulator';

export function SimulatorPanel() {
  const { state } = useAppContext();
  const [messages, setMessages] = useState<SimulatorMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [simulator, setSimulator] = useState<CloneSimulator | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const completedJob = state.trainingJobs.find(
    (job) => job.status === 'completed' && job.modelEndpoint
  );

  useEffect(() => {
    if (completedJob && completedJob.modelEndpoint) {
      const modelInfo: ModelInfo = {
        id: completedJob.jobId,
        baseModel: completedJob.config.baseModel,
        finetuningDate: completedJob.endTime || new Date(),
        datasetSize: state.processedMessages.length,
        endpoint: completedJob.modelEndpoint,
      };
      const sim = new CloneSimulator(modelInfo, state.modalConfig);
      setSimulator(sim);
      setSystemPrompt(sim.getSystemPrompt());
    }
  }, [completedJob, state.processedMessages.length, state.modalConfig]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !simulator || isLoading) return;

    const userMessage: SimulatorMessage = {
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      if (systemPrompt !== simulator.getSystemPrompt()) {
        simulator.setSystemPrompt(systemPrompt);
      }

      const response = await simulator.sendMessage(userMessage.content);

      const assistantMessage: SimulatorMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: SimulatorMessage = {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleReset = () => {
    setMessages([]);
    simulator?.resetConversation();
  };

  if (!completedJob || !completedJob.modelEndpoint) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Clone Simulator</h1>
          <p className="page-description">Test your AI clone in a conversation</p>
        </div>

        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <MessageSquare size={48} />
            </div>
            <div className="empty-state-text">No trained model available</div>
            <div className="empty-state-hint">
              Complete fine-tuning first to test your AI clone
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Clone Simulator</h1>
        <p className="page-description">Test your AI clone in a conversation</p>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Model Information</h2>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value" style={{ fontSize: '16px' }}>
              {completedJob.config.baseModel}
            </div>
            <div className="stat-label">Base Model</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ fontSize: '16px' }}>
              {completedJob.endTime
                ? new Date(completedJob.endTime).toLocaleDateString()
                : 'N/A'}
            </div>
            <div className="stat-label">Training Date</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{state.processedMessages.length}</div>
            <div className="stat-label">Dataset Size</div>
          </div>
        </div>

        <div className="mt-16">
          <div className="text-sm text-muted">Endpoint</div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: '13px',
              color: 'var(--accent)',
              marginTop: '4px',
              wordBreak: 'break-all',
            }}
          >
            {completedJob.modelEndpoint}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-8">
            <Bot size={20} />
            <h2 className="card-title">Chat</h2>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleReset}>
            <RotateCcw size={16} />
            Reset
          </button>
        </div>

        <div className="chat-container">
          <div className="chat-messages" ref={messagesEndRef}>
            {messages.map((msg, index) => (
              <div key={index} className={`chat-message ${msg.role}`}>
                <div>{msg.content}</div>
                <div
                  style={{
                    fontSize: '11px',
                    opacity: 0.6,
                    marginTop: '4px',
                  }}
                >
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="chat-message assistant">
                <div>Thinking...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            <input
              type="text"
              className="chat-input"
              placeholder="Type a message..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              aria-label="Message input"
            />
            <button
              className="btn btn-primary"
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
          </div>
        </div>

        <div className="mt-16">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowSystemPrompt(!showSystemPrompt)}
          >
            {showSystemPrompt ? 'Hide' : 'Show'} System Prompt
          </button>

          {showSystemPrompt && (
            <div className="mt-16">
              <div className="form-group">
                <label className="form-label" htmlFor="system-prompt">System Prompt (Optional)</label>
                <textarea
                  id="system-prompt"
                  className="form-textarea"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Customize the system prompt for your AI clone..."
                  rows={4}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
