import {
  AppState,
  AppStep,
  Message,
  FilterConfig,
  AIConfig,
  ModalConfig,
  ShareGPTConversation,
  AnalysisResponse,
  QualityReport,
  TrainingJob,
  Notification,
  DEFAULT_FILTER_CONFIG,
  DEFAULT_AI_CONFIG,
  DEFAULT_MODAL_CONFIG,
} from '../types';

export const initialState: AppState = {
  rawMessages: [],
  processedMessages: [],
  targetUser: null,
  participants: [],
  filterConfig: DEFAULT_FILTER_CONFIG,
  platform: null,

  aiConfig: DEFAULT_AI_CONFIG,
  modalConfig: DEFAULT_MODAL_CONFIG,
  cleaningProgress: 0,
  isCleaningActive: false,
  cleanedSamples: [],
  styleAnalysis: null,
  qualityReport: null,

  trainingJobs: [],
  activeJobId: null,

  currentStep: 'import',
  notifications: [],
  isLoading: false,
};

export type Action =
  | { type: 'SET_RAW_MESSAGES'; payload: { messages: Message[]; participants: string[]; platform: 'telegram' | 'whatsapp' } }
  | { type: 'SET_TARGET_USER'; payload: string }
  | { type: 'SET_PROCESSED_MESSAGES'; payload: Message[] }
  | { type: 'SET_FILTER_CONFIG'; payload: FilterConfig }
  | { type: 'SET_AI_CONFIG'; payload: AIConfig }
  | { type: 'SET_MODAL_CONFIG'; payload: ModalConfig }
  | { type: 'SET_CLEANING_PROGRESS'; payload: number }
  | { type: 'SET_CLEANING_ACTIVE'; payload: boolean }
  | { type: 'SET_CLEANED_SAMPLES'; payload: ShareGPTConversation[] }
  | { type: 'SET_STYLE_ANALYSIS'; payload: AnalysisResponse | null }
  | { type: 'SET_QUALITY_REPORT'; payload: QualityReport | null }
  | { type: 'SET_CURRENT_STEP'; payload: AppStep }
  | { type: 'ADD_NOTIFICATION'; payload: Notification }
  | { type: 'REMOVE_NOTIFICATION'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_TRAINING_JOBS'; payload: TrainingJob[] }
  | { type: 'UPDATE_TRAINING_JOB'; payload: TrainingJob }
  | { type: 'SET_ACTIVE_JOB'; payload: string | null }
  | { type: 'RESET_STATE' }
  | { type: 'LOAD_DATASET'; payload: { messages: Message[]; targetUser: string; filterConfig: FilterConfig; participants: string[]; platform: 'telegram' | 'whatsapp' | null } };

const datasetDerivedStateReset = {
  cleanedSamples: [] as ShareGPTConversation[],
  styleAnalysis: null as AnalysisResponse | null,
  qualityReport: null as QualityReport | null,
  cleaningProgress: 0,
  isCleaningActive: false,
  trainingJobs: [] as TrainingJob[],
  activeJobId: null as string | null,
  currentStep: 'process' as AppStep,
};

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_RAW_MESSAGES':
      return {
        ...state,
        rawMessages: action.payload.messages,
        participants: action.payload.participants,
        platform: action.payload.platform,
        processedMessages: action.payload.messages,
        targetUser: null,
        ...datasetDerivedStateReset,
      };
    case 'SET_TARGET_USER':
      return { ...state, targetUser: action.payload };
    case 'SET_PROCESSED_MESSAGES':
      return { ...state, processedMessages: action.payload };
    case 'SET_FILTER_CONFIG':
      return { ...state, filterConfig: action.payload };
    case 'SET_AI_CONFIG':
      return { ...state, aiConfig: action.payload };
    case 'SET_MODAL_CONFIG':
      return { ...state, modalConfig: action.payload };
    case 'SET_CLEANING_PROGRESS':
      return { ...state, cleaningProgress: action.payload };
    case 'SET_CLEANING_ACTIVE':
      return { ...state, isCleaningActive: action.payload };
    case 'SET_CLEANED_SAMPLES':
      return { ...state, cleanedSamples: action.payload };
    case 'SET_STYLE_ANALYSIS':
      return { ...state, styleAnalysis: action.payload };
    case 'SET_QUALITY_REPORT':
      return { ...state, qualityReport: action.payload };
    case 'SET_CURRENT_STEP':
      return { ...state, currentStep: action.payload };
    case 'ADD_NOTIFICATION':
      return { ...state, notifications: [...state.notifications, action.payload] };
    case 'REMOVE_NOTIFICATION':
      return { ...state, notifications: state.notifications.filter(n => n.id !== action.payload) };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_TRAINING_JOBS':
      return { ...state, trainingJobs: action.payload };
    case 'UPDATE_TRAINING_JOB':
      return {
        ...state,
        trainingJobs: state.trainingJobs.map(j =>
          j.jobId === action.payload.jobId ? action.payload : j
        ),
      };
    case 'SET_ACTIVE_JOB':
      return { ...state, activeJobId: action.payload };
    case 'RESET_STATE':
      return { ...initialState };
    case 'LOAD_DATASET':
      return {
        ...state,
        rawMessages: action.payload.messages,
        processedMessages: action.payload.messages,
        targetUser: action.payload.targetUser,
        filterConfig: action.payload.filterConfig,
        participants: action.payload.participants,
        platform: action.payload.platform,
        ...datasetDerivedStateReset,
      };
    default:
      return state;
  }
}
