import React, { Suspense, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import {
  Upload,
  Users,
  Sparkles,
  Download,
  Cpu,
  MessageSquare,
  Settings,
  Database,
  CheckCircle,
  Menu,
  X,
} from 'lucide-react';
import { useAppContext } from './context/AppContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import NotificationSystem from './components/NotificationSystem/NotificationSystem';

// Lazy-loaded panels
const FileUpload = React.lazy(() => import('./components/FileUpload/FileUpload'));
const TargetUserSelector = React.lazy(() => import('./components/TargetUserSelector/TargetUserSelector'));
const FilterConfiguration = React.lazy(() => import('./components/FilterConfiguration/FilterConfiguration'));
const AIProcessing = React.lazy(() => import('./components/AIProcessing/AIProcessing').then(m => ({ default: m.AIProcessing })));
const ExportPanel = React.lazy(() => import('./components/ExportPanel/ExportPanel').then(m => ({ default: m.ExportPanel })));
const TrainingPanel = React.lazy(() => import('./components/TrainingPanel/TrainingPanel').then(m => ({ default: m.TrainingPanel })));
const SimulatorPanel = React.lazy(() => import('./components/SimulatorPanel/SimulatorPanel').then(m => ({ default: m.SimulatorPanel })));
const SettingsPanel = React.lazy(() => import('./components/SettingsPanel/SettingsPanel').then(m => ({ default: m.SettingsPanel })));
const DatasetManager = React.lazy(() => import('./components/DatasetManager/DatasetManager').then(m => ({ default: m.DatasetManager })));

function LoadingSkeleton() {
  return (
    <div className="loading-skeleton">
      <div className="skeleton-card" />
      <div className="skeleton-card skeleton-short" />
    </div>
  );
}

const NAV_ITEMS = [
  { path: '/import', label: 'Import Data', icon: Upload },
  { path: '/process', label: 'Process & Filter', icon: Users },
  { path: '/clean', label: 'AI Processing', icon: Sparkles },
  { path: '/export', label: 'Export Dataset', icon: Download },
  { path: '/train', label: 'Fine-Tuning', icon: Cpu },
  { path: '/test', label: 'Clone Simulator', icon: MessageSquare },
] as const;

const STEP_ORDER = ['/import', '/process', '/clean', '/export', '/train', '/test'];

function isStepCompleted(path: string, state: ReturnType<typeof useAppContext>['state']) {
  switch (path) {
    case '/import':
      return state.rawMessages.length > 0;
    case '/process':
      return !!state.targetUser;
    case '/clean':
      return state.cleanedSamples.length > 0;
    case '/export':
      return state.cleanedSamples.length > 0 || state.processedMessages.length > 0;
    case '/train':
      return state.trainingJobs.some(j => j.status === 'completed');
    default:
      return false;
  }
}

function getStepStatus(path: string, currentPath: string, state: ReturnType<typeof useAppContext>['state']) {
  if (currentPath === path) return 'active';

  const currentIdx = STEP_ORDER.indexOf(currentPath);
  const stepIdx = STEP_ORDER.indexOf(path);

  // Keep completion badges visible even outside workflow routes (e.g. /settings, /datasets).
  if (isStepCompleted(path, state)) {
    if (currentIdx === -1) return 'completed';
    if (stepIdx !== -1 && stepIdx <= currentIdx) return 'completed';
  }

  return '';
}

function ProcessPage() {
  const { state } = useAppContext();
  return (
    <div className="process-layout">
      <Suspense fallback={<LoadingSkeleton />}>
        <TargetUserSelector />
      </Suspense>
      {state.targetUser && (
        <Suspense fallback={<LoadingSkeleton />}>
          <FilterConfiguration />
        </Suspense>
      )}
    </div>
  );
}

function App() {
  const { state } = useAppContext();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentPath = location.pathname;

  return (
    <div className="app-layout">
      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`} role="navigation" aria-label="Main navigation">
        <div className="sidebar-logo">
          <Sparkles size={24} aria-hidden="true" />
          AI Clone Studio
          <button
            className="mobile-menu-close"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav>
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const status = getStepStatus(path, currentPath, state);
            return (
              <NavLink
                key={path}
                to={path}
                className={`nav-step ${status}`}
                onClick={() => setMobileMenuOpen(false)}
                aria-current={currentPath === path ? 'page' : undefined}
              >
                <span className="nav-step-icon" aria-hidden="true">
                  {status === 'completed' ? <CheckCircle size={16} /> : <Icon size={16} />}
                </span>
                {label}
              </NavLink>
            );
          })}
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <NavLink
            to="/datasets"
            className={({ isActive }) => `nav-step ${isActive ? 'active' : ''}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="nav-step-icon" aria-hidden="true"><Database size={16} /></span>
            Datasets
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => `nav-step ${isActive ? 'active' : ''}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="nav-step-icon" aria-hidden="true"><Settings size={16} /></span>
            Settings
          </NavLink>
        </div>
      </aside>

      <main className="main-content">
        {/* Mobile header */}
        <div className="mobile-header">
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu size={24} />
          </button>
          <span className="mobile-header-title">AI Clone Studio</span>
        </div>

        <ErrorBoundary>
          <Suspense fallback={<LoadingSkeleton />}>
            <Routes>
              <Route path="/" element={<Navigate to="/import" replace />} />
              <Route path="/import" element={<FileUpload />} />
              <Route path="/process" element={<ProcessPage />} />
              <Route path="/clean" element={<AIProcessing />} />
              <Route path="/export" element={<ExportPanel />} />
              <Route path="/train" element={<TrainingPanel />} />
              <Route path="/test" element={<SimulatorPanel />} />
              <Route path="/settings" element={<SettingsPanel />} />
              <Route path="/datasets" element={<DatasetManager />} />
              <Route path="*" element={<Navigate to="/import" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      <NotificationSystem />
    </div>
  );
}

export default App;
