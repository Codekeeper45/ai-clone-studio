import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';

const TargetUserSelector: React.FC = () => {
  const { state, actions } = useAppContext();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const participantStats = useMemo(() => {
    return state.participants
      .map((participant) => ({
        name: participant,
        messageCount: state.rawMessages.filter(
          (msg) => msg.sender.toLowerCase() === participant.toLowerCase()
        ).length,
      }))
      .sort((a, b) => b.messageCount - a.messageCount);
  }, [state.participants, state.rawMessages]);

  const filteredParticipants = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return participantStats;
    return participantStats.filter(({ name }) => name.toLowerCase().includes(query));
  }, [participantStats, searchQuery]);

  const handleContinue = () => {
    if (state.targetUser) {
      navigate('/clean');
    }
  };

  return (
    <div className="target-user-selector">
      <div className="page-header">
        <h2 className="page-title">Select Target User</h2>
        <p className="page-description">
          Choose the person whose communication style you want to clone
        </p>
      </div>

      <div className="participants-toolbar">
        <input
          type="text"
          className="form-input participants-search"
          placeholder="Search participant..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <p className="participants-meta">
          Showing {filteredParticipants.length} of {participantStats.length}
        </p>
      </div>

      <div className="participants-grid" data-testid="participants-grid">
        {filteredParticipants.map(({ name: participant, messageCount }) => {
          const isSelected = state.targetUser === participant;

          return (
            <button
              key={participant}
              className={`participant-chip ${isSelected ? 'selected' : ''}`}
              data-testid={`participant-chip-${participant}`}
              onClick={() => actions.setTargetUser(participant)}
            >
              <div className="participant-name">{participant}</div>
              <div className="participant-count">
                {messageCount} message{messageCount !== 1 ? 's' : ''}
              </div>
            </button>
          );
        })}
      </div>

      <div className="action-buttons">
        <button
          className="btn btn-primary btn-lg"
          data-testid="process-continue-btn"
          onClick={handleContinue}
          disabled={!state.targetUser}
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default TargetUserSelector;
