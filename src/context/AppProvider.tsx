import React, { useReducer, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  AppStep,
  FilterConfig,
  AIConfig,
  ModalConfig,
  TrainingConfig,
  TrainingJob,
  Notification,
  SavedDataset,
} from '../types';
import { ChatParser } from '../services/ChatParser';
import { DatasetProcessor } from '../services/DatasetProcessor';
import { AIServiceRouter } from '../services/AIServiceRouter';
import { ShareGPTExporter } from '../services/ShareGPTExporter';
import { StorageManager } from '../services/StorageManager';
import { ModalClient } from '../services/ModalClient';
import { ErrorHandler } from '../utils/ErrorHandler';
import { AppContext, AppContextValue } from './AppContext';
import { initialState, appReducer } from './appReducer';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const cleaningAbortRef = useRef<AbortController | null>(null);
  const modalClientRef = useRef<ModalClient | null>(null);
  const storageRef = useRef(new StorageManager());
  const notificationTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const addNotification = useCallback((type: Notification['type'], title: string, message: string) => {
    const notification: Notification = {
      id: uuidv4(),
      type,
      title,
      message,
      timestamp: new Date(),
      autoDismiss: type === 'success' || type === 'info',
    };
    dispatch({ type: 'ADD_NOTIFICATION', payload: notification });
    if (notification.autoDismiss) {
      const timer = setTimeout(() => {
        dispatch({ type: 'REMOVE_NOTIFICATION', payload: notification.id });
        notificationTimersRef.current.delete(timer);
      }, 5000);
      notificationTimersRef.current.add(timer);
    }
  }, []);

  const removeNotification = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
  }, []);

  const importFile = useCallback(async (file: File) => {
    const MAX_JSON_SIZE = 50 * 1024 * 1024;
    const MAX_TXT_SIZE = 20 * 1024 * 1024;
    const isJson = file.name.endsWith('.json');
    const maxSize = isJson ? MAX_JSON_SIZE : MAX_TXT_SIZE;

    if (file.size > maxSize) {
      addNotification('error', 'File Too Large', `Maximum file size is ${isJson ? '50MB' : '20MB'}. Your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`);
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const content = await file.text();
      const parser = new ChatParser();
      const result = parser.parseFile(content, file.name);

      if (result.error) {
        addNotification('error', 'Import Error', result.error);
        return;
      }

      dispatch({
        type: 'SET_RAW_MESSAGES',
        payload: {
          messages: result.messages,
          participants: result.participants,
          platform: result.platform,
        },
      });

      addNotification('success', 'Import Complete', `Successfully imported ${result.messages.length} messages from ${result.participants.length} participants.`);
    } catch (err) {
      const userError = ErrorHandler.handle(err, 'importFile');
      addNotification('error', userError.title, userError.message);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [addNotification]);

  const setTargetUser = useCallback((user: string) => {
    dispatch({ type: 'SET_TARGET_USER', payload: user });
  }, []);

  const applyFilters = useCallback((config: FilterConfig) => {
    dispatch({ type: 'SET_FILTER_CONFIG', payload: config });
    const processor = new DatasetProcessor([...state.rawMessages], state.targetUser || '');
    processor.applyFilters(config);
    dispatch({ type: 'SET_PROCESSED_MESSAGES', payload: processor.getProcessedMessages() });
  }, [state.rawMessages, state.targetUser]);

  const setStep = useCallback((step: AppStep) => {
    dispatch({ type: 'SET_CURRENT_STEP', payload: step });
  }, []);

  const startCleaning = useCallback(async () => {
    if (!state.aiConfig.apiKey) {
      addNotification('error', 'Configuration Required', 'Please set your API key in Settings before cleaning.');
      return;
    }

    if (cleaningAbortRef.current) {
      cleaningAbortRef.current.abort();
    }
    const abortController = new AbortController();
    cleaningAbortRef.current = abortController;

    dispatch({ type: 'SET_CLEANING_ACTIVE', payload: true });
    dispatch({ type: 'SET_CLEANING_PROGRESS', payload: 0 });

    try {
      const router = new AIServiceRouter(state.aiConfig);
      const result = await router.cleanMessages(
        state.processedMessages,
        state.targetUser || '',
        (progress) => {
          dispatch({ type: 'SET_CLEANING_PROGRESS', payload: progress });
        },
        abortController.signal
      );
      if (!abortController.signal.aborted) {
        dispatch({ type: 'SET_CLEANED_SAMPLES', payload: result.samples });
        addNotification('success', 'Cleaning Complete', `Generated ${result.samples.length} training samples. Estimated cost: $${result.cost.toFixed(4)}`);
      }
    } catch (err) {
      if ((err as Error).message === 'Cancelled' || abortController.signal.aborted) {
        addNotification('info', 'Cancelled', 'AI cleaning was cancelled.');
      } else {
        const userError = ErrorHandler.handle(err, 'startCleaning');
        addNotification('error', userError.title, userError.message);
      }
    } finally {
      dispatch({ type: 'SET_CLEANING_ACTIVE', payload: false });
      if (cleaningAbortRef.current === abortController) {
        cleaningAbortRef.current = null;
      }
    }
  }, [state.aiConfig, state.processedMessages, state.targetUser, addNotification]);

  const cancelCleaning = useCallback(() => {
    if (cleaningAbortRef.current) {
      cleaningAbortRef.current.abort();
      cleaningAbortRef.current = null;
    }
  }, []);

  const analyzeStyle = useCallback(async () => {
    if (!state.aiConfig.apiKey) {
      addNotification('error', 'Configuration Required', 'Please set your API key in Settings.');
      return;
    }
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const router = new AIServiceRouter(state.aiConfig);
      const targetMessages = state.processedMessages.filter(
        m => m.sender.toLowerCase() === (state.targetUser || '').toLowerCase()
      );
      const analysis = await router.analyzeStyle(targetMessages);
      dispatch({ type: 'SET_STYLE_ANALYSIS', payload: analysis });
      addNotification('success', 'Analysis Complete', `Style analysis completed with ${(analysis.confidence * 100).toFixed(0)}% confidence.`);
    } catch (err) {
      const userError = ErrorHandler.handle(err, 'analyzeStyle');
      addNotification('error', userError.title, userError.message);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.aiConfig, state.processedMessages, state.targetUser, addNotification]);

  const auditQuality = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const samplesToAudit = state.cleanedSamples.length > 0 ? state.cleanedSamples : undefined;
      if (!samplesToAudit || samplesToAudit.length === 0) {
        addNotification('warning', 'No Data', 'Please run AI cleaning first to generate samples for audit.');
        return;
      }
      const router = new AIServiceRouter(state.aiConfig);
      const report = await router.auditQuality(samplesToAudit);
      dispatch({ type: 'SET_QUALITY_REPORT', payload: report });
      addNotification('success', 'Audit Complete', `Quality score: ${report.score}/100`);
    } catch (err) {
      const userError = ErrorHandler.handle(err, 'auditQuality');
      addNotification('error', userError.title, userError.message);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.aiConfig, state.cleanedSamples, addNotification]);

  const exportDataset = useCallback(() => {
    try {
      const samplesToExport = state.cleanedSamples.length > 0
        ? state.cleanedSamples
        : new ShareGPTExporter(state.processedMessages, state.targetUser || '').convertToShareGPT();

      const exporter = new ShareGPTExporter(state.processedMessages, state.targetUser || '');
      exporter.addMetadata({
        dataset_name: `${state.targetUser}_clone`,
        target_user: state.targetUser || '',
        creation_date: new Date().toISOString(),
        total_samples: samplesToExport.length,
        platform: state.platform || 'unknown',
        filters_applied: state.filterConfig,
      });

      if (state.cleanedSamples.length > 0) {
        const lines: string[] = [];
        for (const sample of state.cleanedSamples) {
          lines.push(JSON.stringify(sample));
        }
        const content = lines.join('\n');
        const blob = new Blob([content], { type: 'application/jsonl' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = ShareGPTExporter.generateFilename(state.targetUser || 'unknown');
        a.click();
        URL.revokeObjectURL(url);
      } else {
        exporter.downloadFile();
      }

      addNotification('success', 'Export Complete', `Exported ${samplesToExport.length} samples.`);
    } catch (err) {
      const userError = ErrorHandler.handle(err, 'exportDataset');
      addNotification('error', userError.title, userError.message);
    }
  }, [state.cleanedSamples, state.processedMessages, state.targetUser, state.platform, state.filterConfig, addNotification]);

  const startTraining = useCallback(async (config: TrainingConfig) => {
    if (!state.modalConfig.tokenId || !state.modalConfig.tokenSecret || !state.modalConfig.endpoint) {
      addNotification('error', 'Modal Configuration Required', 'Please configure your Modal.com credentials and endpoint URL in Settings.');
      return;
    }
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const client = new ModalClient(state.modalConfig);
      modalClientRef.current = client;
      const exporter = new ShareGPTExporter(state.processedMessages, state.targetUser || '');
      const jsonl = exporter.generateJSONL();

      const jobId = await client.startTraining(jsonl, config);

      const job: TrainingJob = {
        jobId,
        status: 'queued',
        progress: 0,
        config,
        logs: [],
        startTime: new Date(),
      };

      dispatch({ type: 'SET_TRAINING_JOBS', payload: [...state.trainingJobs, job] });
      dispatch({ type: 'SET_ACTIVE_JOB', payload: jobId });

      client.pollJobUntilDone(jobId, (updatedJob) => {
        dispatch({ type: 'UPDATE_TRAINING_JOB', payload: updatedJob });
      }).then((finalJob) => {
        if (finalJob.status === 'completed') {
          addNotification('success', 'Training Complete', `Model trained successfully! Endpoint: ${finalJob.modelEndpoint || 'N/A'}`);
        } else if (finalJob.status === 'failed') {
          addNotification('error', 'Training Failed', finalJob.error || 'Training job failed.');
        }
      }).catch((err) => {
        const failedJob: TrainingJob = {
          ...job,
          status: 'failed',
          endTime: new Date(),
          error: err instanceof Error ? err.message : 'Polling failed',
        };
        dispatch({ type: 'UPDATE_TRAINING_JOB', payload: failedJob });
        addNotification('error', 'Training Failed', failedJob.error || 'Training job failed.');
      });

      addNotification('info', 'Training Started', `Training job ${jobId} has been queued.`);
    } catch (err) {
      const userError = ErrorHandler.handle(err, 'startTraining');
      addNotification('error', userError.title, userError.message);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.processedMessages, state.targetUser, state.trainingJobs, state.modalConfig, addNotification]);

  const cancelTraining = useCallback(async (jobId: string) => {
    try {
      if (state.modalConfig.endpoint && state.modalConfig.tokenId && state.modalConfig.tokenSecret) {
        const client = new ModalClient(state.modalConfig);
        await client.cancelTraining(jobId);
      }
      if (modalClientRef.current) {
        modalClientRef.current.stopAll();
      }
      addNotification('info', 'Cancelled', `Training job ${jobId} has been cancelled.`);
    } catch (err) {
      const userError = ErrorHandler.handle(err, 'cancelTraining');
      addNotification('error', userError.title, userError.message);
    }
  }, [state.modalConfig, addNotification]);

  const saveDataset = useCallback(async (name: string) => {
    try {
      const dataset: SavedDataset = {
        id: uuidv4(),
        name,
        createdAt: new Date(),
        updatedAt: new Date(),
        messageCount: state.rawMessages.length,
        targetUser: state.targetUser || '',
        messages: state.rawMessages,
        filterConfig: state.filterConfig,
        version: 1,
      };
      await storageRef.current.saveDataset(dataset);
      addNotification('success', 'Saved', `Dataset "${name}" saved successfully.`);
    } catch (err) {
      const userError = ErrorHandler.handle(err, 'saveDataset');
      addNotification('error', userError.title, userError.message);
    }
  }, [state.rawMessages, state.targetUser, state.filterConfig, addNotification]);

  const loadDataset = useCallback(async (id: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const dataset = await storageRef.current.loadDataset(id);
      if (!dataset) {
        addNotification('error', 'Load Error', 'Dataset not found or corrupted.');
        return;
      }
      const participants = [...new Set(dataset.messages.map(m => m.sender))];
      const detectedPlatform = (dataset.messages.find(m => !!m.metadata?.platform)?.metadata?.platform || null) as 'telegram' | 'whatsapp' | null;
      dispatch({
        type: 'LOAD_DATASET',
        payload: {
          messages: dataset.messages,
          targetUser: dataset.targetUser,
          filterConfig: dataset.filterConfig,
          participants,
          platform: detectedPlatform,
        },
      });
      addNotification('success', 'Loaded', `Dataset "${dataset.name}" loaded with ${dataset.messageCount} messages.`);
    } catch (err) {
      const userError = ErrorHandler.handle(err, 'loadDataset');
      addNotification('error', userError.title, userError.message);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [addNotification]);

  const deleteDataset = useCallback(async (id: string) => {
    try {
      await storageRef.current.deleteDataset(id);
      addNotification('success', 'Deleted', 'Dataset deleted successfully.');
    } catch (err) {
      const userError = ErrorHandler.handle(err, 'deleteDataset');
      addNotification('error', userError.title, userError.message);
    }
  }, [addNotification]);

  const updateAIConfig = useCallback((config: AIConfig) => {
    dispatch({ type: 'SET_AI_CONFIG', payload: config });
  }, []);

  const updateModalConfig = useCallback((config: ModalConfig) => {
    dispatch({ type: 'SET_MODAL_CONFIG', payload: config });
  }, []);

  const resetState = useCallback(() => {
    dispatch({ type: 'RESET_STATE' });
  }, []);

  const value: AppContextValue = {
    state,
    actions: {
      importFile,
      setTargetUser,
      applyFilters,
      setStep,
      startCleaning,
      cancelCleaning,
      analyzeStyle,
      auditQuality,
      exportDataset,
      startTraining,
      cancelTraining,
      saveDataset,
      loadDataset,
      deleteDataset,
      updateAIConfig,
      updateModalConfig,
      addNotification,
      removeNotification,
      resetState,
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
