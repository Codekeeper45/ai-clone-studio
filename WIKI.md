# AI Clone Studio — Wiki (Production 10/10)

## Содержание

- [Обзор проекта](#обзор-проекта)
- [Архитектура](#архитектура)
- [Пайплайн: от чата до клона](#пайплайн-от-чата-до-клона)
- [Сервисы (подробно)](#сервисы-подробно)
  - [ChatParser](#chatparser)
  - [DatasetProcessor](#datasetprocessor)
  - [AIServiceRouter](#aiservicerouter)
  - [ShareGPTExporter](#sharegptexporter)
  - [StorageManager (v2)](#storagemanager-v2)
  - [ModalClient (Production)](#modalclient-production)
  - [CloneSimulator](#clonesimulator)
- [Бэкенд на Modal.com + Unsloth](#бэкенд-на-modalcom--unsloth)
- [UI-компоненты](#ui-компоненты)
- [Стейт-менеджмент](#стейт-менеджмент)
- [Безопасность](#безопасность)
- [Интеграция Unsloth](#интеграция-unsloth)

---

## Обзор проекта

AI Clone Studio — профессиональное SPA (React + TypeScript + Vite), которое превращает историю переписок из Telegram и WhatsApp в высококачественный датасет для обучения AI-клона. Проект включает в себя полноценный бэкенд на базе Modal.com для тренировки моделей через Unsloth.

**Стек:** React 18, React Router 6, Vitest, Modal.com (Python/FastAPI), Unsloth.

---

## Архитектура

```
┌─────────────────────────────────────────────────────────┐
│                     React Frontend                      │
│                                                         │
│  [Routing] -> Import | Process | Clean | Train | Chat   │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │             AppProvider (Context API)             │  │
│  └──────┬──────────┬──────────┬──────────┬───────┬───┘  │
│         │          │          │          │       │      │
│  ┌──────▼─┐ ┌──────▼─┐ ┌──────▼─┐ ┌──────▼─┐ ┌───▼──┐   │
│  │ Parser │ │ Processor│ │ AI Svc │ │ Exporter │ Client │   │
│  └────────┘ └────────┘ └────┬───┘ └────────┘ └───┬──┘   │
└─────────────────────────────┼────────────────────┼──────┘
                              │                    │
                      ┌───────▼───────┐    ┌───────▼───────┐
                      │ Gemini/OpenAI │    │   Modal.com   │
                      │ API (Browser) │    │   Backend     │
                      └───────────────┘    └───────┬───────┘
                                                   │
                                           ┌───────▼───────┐
                                           │  GPU Worker   │
                                           │ (Unsloth/SFT) │
                                           └───────────────┘
```

---

## Пайплайн: от чата до клона

### Шаг 1: Import
**Файл:** `FileUpload.tsx` → `ChatParser.ts`
Загрузка экспорта чата. Поддерживаются файлы до 50MB (Telegram JSON) и 20MB (WhatsApp TXT).
- Автоопределение формата.
- Сортировка по времени.
- Извлечение всех участников.

### Шаг 2: Process & Filter
**Файл:** `FilterConfiguration.tsx` → `DatasetProcessor.ts`
Выбор «цели» (кого клонируем) и очистка шума.
- **Burst Merge:** Склейка сообщений одного автора в окне 5 минут.
- **Min Length:** Удаление коротких фраз.
- **Lazy Filter:** Удаление мусора ("ок", "ага") через Regex.
- **Identity Guard:** Оставляет только сообщения целевого пользователя.

### Шаг 3: AI Processing
**Файл:** `AIProcessing.tsx` → `AIServiceRouter.ts`
Глубокая очистка через LLM.
- **AI Cleaning:** Конвертация в ShareGPT формат. Роль цели — `gpt`.
- **Style Analysis:** Анализ тона, юмора и лексикона.
- **Quality Audit:** Проверка баланса ролей и качества диалогов.

### Шаг 4: Export
**Файл:** `ExportPanel.tsx` → `ShareGPTExporter.ts`
Скачивание датасета в формате **ShareGPT JSONL** с метаданными. Полностью готов для загрузки в Unsloth.

### Шаг 5: Fine-Tuning
**Файл:** `TrainingPanel.tsx` → `ModalClient.ts`
Запуск реального обучения на Modal.com.
- Выбор из 23 актуальных моделей (Llama 3.2, Gemma 3, Qwen 2.5 и др.).
- Настройка LoRA и гиперпараметров.
- **Streaming Logs:** Просмотр логов обучения в реальном времени через SSE.

### Шаг 6: Simulator
**Файл:** `SimulatorPanel.tsx`
Чат с обученной моделью через эндпоинт на Modal.

---

## Сервисы (подробно)

### StorageManager (v2)
- **IndexedDB:** Хранение датасетов с версионированием (v2).
- **Сжатие:** LZ-String (UTF-16).
- **Шифрование:** AES-GCM для API ключей.
- **Data Portability:** Функции **Backup All** и **Restore** для миграции данных между устройствами.

### ModalClient (Production)
Реальный клиент для общения с бэкендом на Modal:
- `startTraining()`: POST запрос с JSONL датасетом.
- `streamLogs()`: Подключение через `EventSource` (SSE).
- `pollJobUntilDone()`: Адаптивный опрос (2с при работе, 5с в очереди).
- `runInference()`: Вызов обученной модели.

---

## Бэкенд на Modal.com + Unsloth

Бэкенд состоит из двух Python-скриптов в папке `/modal`:

1.  **`train.py`**: Унифицированный скрипт обучения. Поддерживает все 6 семейств моделей с правильными чат-шаблонами (Llama-3.1, Gemma-3, Phi-4, ChatML). Использует `train_on_responses_only` для лучшего качества.
2.  **`api.py`**: FastAPI сервер на Modal.
    - Разворачивает GPU-воркеры (A10G/A100).
    - Управляет хранилищем моделей через `modal.Volume`.
    - Предоставляет эндпоинты для фронтенда.

### Как развернуть бэкенд:
1.  Установите Modal: `pip install modal`
2.  Авторизуйтесь: `modal setup`
3.  Разверните API: `modal deploy modal/api.py`
4.  Скопируйте полученный URL в Settings → Modal Endpoint.

---

## Безопасность

- **Local-first:** Ваши чаты не покидают браузер, пока вы не нажмете "Start Cleaning" или "Start Training".
- **Encrypted Settings:** API-ключи хранятся в зашифрованном виде.
- **Scoped Backups:** При экспорте бэкапа API-ключи заменяются на заглушки (`***`).

---

## Интеграция Unsloth

Используются официальные паттерны Unsloth для:
- **Gemma:** `FastModel` вместо `FastLanguageModel`.
- **Chat Templates:** Автоматическая настройка шаблонов под каждое семейство.
- **Quantization:** QLoRA 4-bit для работы на 24GB VRAM (A10G).
- **Export:** Автоматический экспорт в GGUF (Q4_K_M) после завершения обучения.
