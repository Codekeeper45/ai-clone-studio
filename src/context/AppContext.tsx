import { createContext, useContext } from 'react';
import { AppState, AppStep, FilterConfig, AIConfig, ModalConfig, Notification, TrainingConfig } from '../types';

export interface AppContextValue {
  state: AppState;
  actions: {
    importFile: (file: File) => Promise<void>;
    setTargetUser: (user: string) => void;
    applyFilters: (config: FilterConfig) => void;
    setStep: (step: AppStep) => void;
    startCleaning: () => Promise<void>;
    cancelCleaning: () => void;
    analyzeStyle: () => Promise<void>;
    auditQuality: () => Promise<void>;
    exportDataset: () => void;
    startTraining: (config: TrainingConfig) => Promise<void>;
    cancelTraining: (jobId: string) => Promise<void>;
    saveDataset: (name: string) => Promise<void>;
    loadDataset: (id: string) => Promise<void>;
    deleteDataset: (id: string) => Promise<void>;
    updateAIConfig: (config: AIConfig) => void;
    updateModalConfig: (config: ModalConfig) => void;
    addNotification: (type: Notification['type'], title: string, message: string) => void;
    removeNotification: (id: string) => void;
    resetState: () => void;
  };
}

export const AppContext = createContext<AppContextValue | null>(null);

/**
 * Hook to use the application context
 */
export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
};
