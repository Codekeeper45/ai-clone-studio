# Implementation Plan: AI Clone Studio

## Overview

This implementation plan breaks down the AI Clone Studio into discrete, incremental coding tasks. The system will be built in layers: core data processing, AI integration, UI components, storage, and finally Modal.com training integration. Each task builds on previous work, with property-based tests integrated throughout to ensure correctness.

The implementation uses TypeScript/React for the frontend, with fast-check for property-based testing. All tasks assume the design and requirements documents are available as context.

## Tasks

- [ ] 1. Project setup and core infrastructure
  - Initialize React + TypeScript project with Vite
  - Configure Jest and React Testing Library
  - Install and configure fast-check for property-based testing
  - Set up project structure: src/{components, services, types, utils, test}
  - Create base TypeScript interfaces from design (Message, ParseResult, FilterConfig, etc.)
  - _Requirements: Foundation for all features_

- [ ] 2. Implement Chat Parser component
  - [ ] 2.1 Create ChatParser class with Telegram JSON parsing
    - Implement parseTelegram() method to extract messages from JSON structure
    - Handle nested message arrays and metadata extraction
    - Extract participants list and date range
    - _Requirements: 1.1_
  
  - [ ]* 2.2 Write property test for Telegram parsing completeness
    - **Property 1: Telegram parsing completeness**
    - **Validates: Requirements 1.1**
  
  - [ ] 2.3 Implement WhatsApp TXT parsing
    - Create parseWhatsApp() method with regex-based line parsing
    - Extract timestamp, sender, and text from each line
    - Handle system messages and media placeholders
    - _Requirements: 1.2_
  
  - [ ]* 2.4 Write property test for WhatsApp parsing completeness
    - **Property 2: WhatsApp parsing completeness**
    - **Validates: Requirements 1.2**
  
  - [ ] 2.5 Add format detection and error handling
    - Implement detectFormat() to identify file type
    - Return descriptive errors for invalid formats
    - _Requirements: 1.3_
  
  - [ ]* 2.6 Write property test for parse error handling
    - **Property 3: Parse error handling**
    - **Validates: Requirements 1.3**
  
  - [ ]* 2.7 Write property test for multi-file merge ordering
    - **Property 5: Multi-file merge ordering**
    - **Validates: Requirements 1.6**

- [ ] 3. Implement Dataset Processor component
  - [ ] 3.1 Create DatasetProcessor class with filtering infrastructure
    - Initialize with messages array and target user
    - Implement getStats() for tracking filter operations
    - Create non-destructive filtering pipeline
    - _Requirements: 2.3, 4.1_
  
  - [ ] 3.2 Implement target user filtering
    - Create filterByTargetUser() method
    - Case-insensitive sender matching
    - Track filtered message count
    - _Requirements: 2.3, 2.4_
  
  - [ ]* 3.3 Write property test for target user filtering
    - **Property 7: Target user filtering**
    - **Validates: Requirements 2.3**
  
  - [ ] 3.4 Implement message length filtering
    - Create filterByLength() method with configurable threshold
    - Default minimum length: 10 characters
    - _Requirements: 4.1, 4.2_
  
  - [ ]* 3.5 Write property test for message length filtering
    - **Property 8: Message length filtering**
    - **Validates: Requirements 4.2**
  
  - [ ] 3.6 Implement burst message merging
    - Create mergeBurstMessages() method
    - Detect consecutive messages from same sender within 5-minute window
    - Concatenate text content with newlines
    - _Requirements: 4.3_
  
  - [ ]* 3.7 Write property test for burst message merging
    - **Property 9: Burst message merging**
    - **Validates: Requirements 4.3**
  
  - [ ] 3.8 Implement lazy response filtering
    - Create filterLazyResponses() with pattern matching
    - Support both exact matches and regex patterns
    - Configurable pattern list
    - _Requirements: 4.4, 4.5_
  
  - [ ]* 3.9 Write property test for lazy response filtering
    - **Property 10: Lazy response filtering**
    - **Validates: Requirements 4.5**
  
  - [ ] 3.10 Implement identity guard validation
    - Create validateIdentity() method
    - Toggle-able validation
    - Track and log exclusion count
    - _Requirements: 5.1, 5.3, 5.4_
  
  - [ ]* 3.11 Write property tests for identity guard
    - **Property 12: Identity guard validation**
    - **Property 13: Identity guard exclusion count**
    - **Validates: Requirements 5.1, 5.4**

- [ ] 4. Checkpoint - Core data processing complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement AI Service Router
  - [ ] 5.1 Create AIServiceRouter class with provider abstraction
    - Support Gemini and OpenAI providers
    - Implement API key management
    - Create base request/response handling
    - _Requirements: 3.1, 13.1, 13.2_
  
  - [ ] 5.2 Implement message cleaning functionality
    - Create cleanMessages() method with batch processing
    - Build system prompt for LLM: remove spam, format as ShareGPT, preserve personality
    - Parse LLM response into ShareGPTConversation objects
    - _Requirements: 3.1, 3.2, 3.5_
  
  - [ ]* 5.3 Write property test for batch processing
    - **Property 14: API batch processing**
    - **Validates: Requirements 3.5**
  
  - [ ] 5.4 Implement retry logic with exponential backoff
    - Retry failed API calls up to 3 times
    - Delays: 1s, 2s, 4s
    - _Requirements: 3.7_
  
  - [ ]* 5.5 Write property test for retry logic
    - **Property 16: Retry logic execution**
    - **Validates: Requirements 3.7**
  
  - [ ] 5.6 Implement style analysis
    - Create analyzeStyle() method
    - Prompt LLM to identify: tone, vocabulary, humor, topics, phrases
    - Parse structured response with confidence scores
    - _Requirements: 7.1, 7.2, 7.3, 7.5_
  
  - [ ]* 5.7 Write property test for style analysis structure
    - **Property 17: Style analysis structure completeness**
    - **Validates: Requirements 7.3, 7.5**
  
  - [ ] 5.8 Implement quality audit
    - Create auditQuality() method
    - Calculate metrics: sample count, avg length, diversity, role balance
    - Generate quality score (0-100) and warnings
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  
  - [ ]* 5.9 Write property tests for quality audit
    - **Property 18: Quality audit metrics completeness**
    - **Property 19: Quality issue detection**
    - **Validates: Requirements 8.2, 8.3, 8.4**
  
  - [ ] 5.10 Implement cost estimation
    - Create estimateCost() method
    - Calculate based on message count and model pricing
    - Support Gemini ($0.075/1M tokens) and OpenAI ($0.15/1M tokens)
    - _Requirements: 13.7_
  
  - [ ]* 5.11 Write property test for cost estimation
    - **Property 44: Cost estimation calculation**
    - **Validates: Requirements 13.7**

- [ ] 6. Implement ShareGPT Exporter
  - [ ] 6.1 Create ShareGPTExporter class
    - Initialize with messages and target user
    - Implement conversation pairing logic (human/assistant roles)
    - _Requirements: 6.1, 6.2_
  
  - [ ] 6.2 Implement JSONL generation
    - Create generateJSONL() method
    - One conversation per line
    - Include metadata header
    - _Requirements: 6.3, 6.4_
  
  - [ ]* 6.3 Write property tests for ShareGPT export
    - **Property 20: ShareGPT format compliance**
    - **Property 21: JSONL format validity**
    - **Property 22: Export metadata completeness**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
  
  - [ ] 6.4 Implement file download functionality
    - Create downloadFile() method
    - Generate filename: {targetUser}_clone_dataset_{timestamp}.jsonl
    - Trigger browser download
    - _Requirements: 6.5, 6.6_
  
  - [ ]* 6.5 Write property test for filename pattern
    - **Property 23: Filename pattern compliance**
    - **Validates: Requirements 6.6**

- [ ] 7. Checkpoint - AI processing and export complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement Local Storage Manager
  - [ ] 8.1 Create StorageManager class
    - Implement IndexedDB wrapper for large datasets
    - Fallback to localStorage for small data
    - Add LZ-string compression
    - _Requirements: 11.1, 11.2_
  
  - [ ] 8.2 Implement dataset save/load
    - Create saveDataset() with full state serialization
    - Create loadDataset() with format validation
    - _Requirements: 11.1, 11.2, 11.3, 11.4_
  
  - [ ]* 8.3 Write property test for persistence round-trip
    - **Property 32: Dataset persistence round-trip**
    - **Validates: Requirements 11.3**
  
  - [ ] 8.4 Implement dataset management
    - Create listDatasets() with metadata
    - Create deleteDataset() with cleanup
    - Implement 50MB size limit enforcement
    - _Requirements: 11.5, 11.6, 11.7_
  
  - [ ]* 8.5 Write property tests for storage operations
    - **Property 34: Saved dataset list completeness**
    - **Property 35: Dataset deletion**
    - **Validates: Requirements 11.5, 11.6**
  
  - [ ] 8.6 Implement settings storage with encryption
    - Store API keys with Web Crypto API encryption
    - Persist AI configuration
    - _Requirements: 13.4, 13.6_
  
  - [ ]* 8.7 Write property test for API key encryption
    - **Property 43: API key encryption**
    - **Validates: Requirements 13.6**

- [ ] 9. Implement Modal.com Integration Client
  - [ ] 9.1 Create ModalClient class
    - Initialize with API key
    - Implement authentication
    - _Requirements: 10.1_
  
  - [ ] 9.2 Implement dataset upload
    - Create uploadDataset() with multipart upload
    - Handle large files
    - Return dataset ID
    - _Requirements: 10.1_
  
  - [ ] 9.3 Implement training job management
    - Create startTraining() with full config
    - Create getJobStatus() for polling
    - Create cancelJob() for cancellation
    - _Requirements: 10.2, 10.4, 10.7_
  
  - [ ]* 9.4 Write property test for training configuration
    - **Property 27: Training configuration completeness**
    - **Validates: Requirements 10.2**
  
  - [ ] 9.5 Implement status polling and notifications
    - Poll every 5 seconds during training
    - Update progress, logs, and metrics
    - Handle completion and failure states
    - _Requirements: 10.4, 10.6, 10.7_
  
  - [ ]* 9.6 Write property tests for training lifecycle
    - **Property 28: Training status updates**
    - **Property 29: Training completion notification**
    - **Property 30: Training failure error reporting**
    - **Validates: Requirements 10.4, 10.6, 10.7**

- [ ] 10. Implement Clone Simulator component
  - [ ] 10.1 Create CloneSimulator class
    - Initialize with model info
    - Maintain conversation history (max 50 messages)
    - _Requirements: 9.1, 9.4_
  
  - [ ] 10.2 Implement message sending
    - Create sendMessage() with context
    - Call model endpoint with full conversation
    - Support streaming responses
    - _Requirements: 9.2, 9.4_
  
  - [ ]* 10.3 Write property tests for simulator
    - **Property 24: Simulator API integration**
    - **Property 25: Simulator conversation history**
    - **Property 26: Simulator context preservation**
    - **Validates: Requirements 9.2, 9.3, 9.4**
  
  - [ ] 10.4 Implement conversation management
    - Create resetConversation() to clear history
    - Create setSystemPrompt() for customization
    - Default prompt: "You are {targetUser}. Respond naturally in their style."
    - _Requirements: 9.6_

- [ ] 11. Checkpoint - Backend integration complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Build React UI components
  - [ ] 12.1 Create App shell with routing and state management
    - Set up React Context for global state
    - Implement AppState and AppActions from design
    - Create step-based navigation: import → process → clean → export → train → test
    - _Requirements: All UI requirements_
  
  - [ ] 12.2 Create FileUpload component
    - File input with drag-and-drop
    - Format detection and validation
    - Display parse results and statistics
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  
  - [ ]* 12.3 Write unit tests for FileUpload component
    - Test file upload interaction
    - Test error display
    - Test statistics display
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  
  - [ ] 12.4 Create TargetUserSelector component
    - Display participant list from parsed data
    - Handle user selection
    - Prevent progression without selection
    - _Requirements: 2.1, 2.2, 2.3, 2.5_
  
  - [ ]* 12.5 Write unit tests for TargetUserSelector
    - Test participant display
    - Test selection behavior
    - Test validation
    - _Requirements: 2.1, 2.2, 2.5_
  
  - [ ] 12.6 Create FilterConfiguration component
    - Configurable filters: min length, burst merging, lazy responses, identity guard
    - Real-time filter statistics display
    - Apply/reset functionality
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.3_
  
  - [ ]* 12.7 Write unit tests for FilterConfiguration
    - Test filter controls
    - Test statistics updates
    - _Requirements: 4.6_
  
  - [ ] 12.8 Create AIProcessing component
    - Trigger AI cleaning with progress bar
    - Display style analysis results
    - Show quality audit report
    - Cost estimation display
    - _Requirements: 3.1, 3.2, 7.1, 7.3, 7.4, 8.1, 8.2, 8.6, 12.1, 12.2, 13.7_
  
  - [ ]* 12.9 Write property tests for progress tracking
    - **Property 36: Progress tracking accuracy**
    - **Property 37: Time estimation display**
    - **Validates: Requirements 12.1, 12.2, 12.3**
  
  - [ ] 12.10 Create ExportPanel component
    - Export button with metadata configuration
    - Download trigger
    - Export success notification
    - _Requirements: 6.1, 6.5, 12.4_
  
  - [ ] 12.11 Create TrainingPanel component
    - Training configuration form: base model, LoRA params, learning rate, epochs
    - Start training button
    - Real-time status display with logs
    - Cancel button
    - _Requirements: 10.1, 10.2, 10.4, 10.5, 12.6_
  
  - [ ] 12.12 Create SimulatorPanel component
    - Chat interface with message input
    - Conversation history display
    - Model metadata display
    - Reset conversation button
    - Placeholder for untrained models
    - _Requirements: 9.1, 9.2, 9.3, 9.5, 9.6, 9.7_
  
  - [ ]* 12.13 Write unit tests for SimulatorPanel
    - Test message sending
    - Test history display
    - Test reset functionality
    - _Requirements: 9.2, 9.3, 9.6_
  
  - [ ] 12.14 Create SettingsPanel component
    - API provider selection (Gemini/OpenAI)
    - API key input with encryption
    - Model selection
    - Batch size configuration
    - Default settings
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_
  
  - [ ]* 12.15 Write property test for settings validation
    - **Property 41: Settings validation**
    - **Validates: Requirements 13.3**
  
  - [ ] 12.16 Create DatasetManager component
    - List saved datasets with metadata
    - Load dataset button
    - Delete dataset button
    - Storage usage display
    - _Requirements: 11.5, 11.6_
  
  - [ ] 12.17 Create NotificationSystem component
    - Success notifications with statistics
    - Error notifications with guidance
    - Auto-dismiss and manual close
    - _Requirements: 12.4, 12.5_
  
  - [ ]* 12.18 Write property tests for notifications
    - **Property 38: Completion notification**
    - **Property 39: Error notification**
    - **Validates: Requirements 12.4, 12.5**

- [ ] 13. Implement custom test generators
  - [ ] 13.1 Create domain-specific generators for property tests
    - telegramMessage generator
    - whatsappLine generator
    - shareGPTConversation generator
    - datasetWithBursts generator
    - _Requirements: Testing infrastructure_
  
  - [ ] 13.2 Create test utilities and helpers
    - Mock API responses
    - File generation utilities
    - Storage mocking
    - _Requirements: Testing infrastructure_

- [ ] 14. Integration and wiring
  - [ ] 14.1 Wire all components together in App
    - Connect FileUpload → ChatParser
    - Connect TargetUserSelector → DatasetProcessor
    - Connect FilterConfiguration → DatasetProcessor
    - Connect AIProcessing → AIServiceRouter
    - Connect ExportPanel → ShareGPTExporter
    - Connect TrainingPanel → ModalClient
    - Connect SimulatorPanel → CloneSimulator
    - Connect SettingsPanel → StorageManager
    - Connect DatasetManager → StorageManager
    - _Requirements: All requirements_
  
  - [ ]* 14.2 Write integration tests for main user flows
    - Test import → process → export flow
    - Test import → clean → export → train flow
    - Test save → load dataset flow
    - _Requirements: All requirements_
  
  - [ ] 14.3 Add error boundaries and global error handling
    - Implement ErrorHandler from design
    - Add error boundaries to main components
    - Map errors to user-friendly messages
    - _Requirements: Error handling for all features_

- [ ] 15. Final checkpoint - Complete system integration
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 16. Polish and optimization
  - [ ] 16.1 Add loading states and skeleton screens
    - Loading indicators for all async operations
    - Skeleton screens for data-heavy components
    - _Requirements: 12.1, 12.2_
  
  - [ ] 16.2 Optimize performance
    - Memoize expensive computations
    - Virtualize long message lists
    - Debounce filter updates
    - _Requirements: Performance optimization_
  
  - [ ] 16.3 Add accessibility features
    - ARIA labels for all interactive elements
    - Keyboard navigation support
    - Screen reader announcements for status changes
    - _Requirements: Accessibility compliance_
  
  - [ ] 16.4 Create user documentation
    - In-app tooltips and help text
    - README with setup instructions
    - Example datasets for testing
    - _Requirements: User guidance_

## Notes

- Tasks marked with `*` are optional property-based and unit tests that can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at major milestones
- Property tests validate universal correctness properties (minimum 100 iterations each)
- Unit tests validate specific examples, edge cases, and UI interactions
- All components are built incrementally with tests integrated throughout
- The implementation follows a bottom-up approach: core logic → services → UI → integration
