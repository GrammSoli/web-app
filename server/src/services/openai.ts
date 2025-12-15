import OpenAI from 'openai';
import { aiLogger } from '../utils/logger.js';
import { calculateTextCost, calculateAudioCost, type TextModel } from '../utils/pricing.js';
import { configService } from './config.js';

// ============================================
// OPENAI CLIENT INITIALIZATION
// ============================================

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('OPENAI_API_KEY environment variable is required');
}

const openai = new OpenAI({
  apiKey,
  maxRetries: 3, // Retry on rate limits and transient errors
  timeout: 60000, // 60 second timeout
});

// ============================================
// ТИПЫ
// ============================================

export interface MoodAnalysisResult {
  moodScore: number;        // 1-10
  moodLabel: string;        // "радость", "грусть", и т.д.
  tags: string[];           // ["благодарность", "усталость"]
  summary: string;          // Краткое резюме
  suggestions: string;      // Рекомендации
}

export interface AnalysisResponse {
  result: MoodAnalysisResult;
  usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  requestId?: string;
}

export interface TranscriptionResponse {
  text: string;
  durationSeconds: number;
  usage: {
    costUsd: number;
  };
}

// ============================================
// ПРОМПТЫ (fallback)
// ============================================

const DEFAULT_SYSTEM_PROMPT = `Ты — эмпатичный психолог-аналитик. Твоя задача — анализировать записи дневника и определять эмоциональное состояние человека.

Отвечай ТОЛЬКО в формате JSON (без markdown):
{
  "moodScore": <число от 1 до 10, где 1 = очень плохо, 5 = нейтрально, 10 = отлично>,
  "moodLabel": "<одно слово: радость/грусть/тревога/спокойствие/злость/усталость/воодушевление/апатия>",
  "tags": ["<тег1>", "<тег2>", "<тег3>"],
  "summary": "<краткое резюме записи в 1-2 предложениях>",
  "suggestions": "<мягкая рекомендация или поддержка в 1-2 предложениях>"
}

Правила:
- Теги должны отражать ключевые эмоции и темы (максимум 5 тегов)
- Рекомендации должны быть тёплыми и поддерживающими, не навязчивыми
- Если запись слишком короткая для анализа, всё равно постарайся дать оценку
- Отвечай на русском языке`;

/**
 * Get AI settings from config
 */
async function getAISettings(): Promise<{
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  model: TextModel;
}> {
  const [systemPrompt, temperature, maxTokens, model] = await Promise.all([
    configService.getString('ai.system_prompt', DEFAULT_SYSTEM_PROMPT),
    configService.getNumber('ai.temperature', 0.7),
    configService.getNumber('ai.max_tokens', 500),
    configService.getString('ai.default_model', 'gpt-4o-mini'),
  ]);

  return {
    systemPrompt,
    temperature,
    maxTokens,
    model: model as TextModel,
  };
}

// ============================================
// АНАЛИЗ ТЕКСТА
// ============================================

export async function analyzeMood(
  text: string,
  modelOverride?: TextModel
): Promise<AnalysisResponse> {
  const startTime = Date.now();
  
  try {
    // Get dynamic config
    const settings = await getAISettings();
    const model = modelOverride || settings.model;
    
    aiLogger.debug({ textLength: text.length, model }, 'Starting mood analysis');
    
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: settings.systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
      response_format: { type: 'json_object' },
    });
    
    const latencyMs = Date.now() - startTime;
    const content = response.choices[0]?.message?.content || '{}';
    const usage = response.usage;
    
    // Парсим JSON ответ
    let result: MoodAnalysisResult;
    try {
      result = JSON.parse(content);
    } catch {
      aiLogger.error({ content }, 'Failed to parse AI response as JSON');
      result = {
        moodScore: 5,
        moodLabel: 'неопределённо',
        tags: [],
        summary: 'Не удалось проанализировать запись',
        suggestions: 'Попробуйте написать подробнее о своих чувствах',
      };
    }
    
    // Валидация moodScore
    result.moodScore = Math.max(1, Math.min(10, Math.round(result.moodScore || 5)));
    
    const inputTokens = usage?.prompt_tokens || 0;
    const outputTokens = usage?.completion_tokens || 0;
    const costUsd = calculateTextCost(model, inputTokens, outputTokens);
    
    aiLogger.info({
      moodScore: result.moodScore,
      moodLabel: result.moodLabel,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
    }, 'Mood analysis completed');
    
    return {
      result,
      usage: {
        inputTokens,
        outputTokens,
        costUsd,
      },
      requestId: response.id,
    };
  } catch (error) {
    aiLogger.error({ error }, 'Mood analysis failed');
    throw error;
  }
}

// ============================================
// ТРАНСКРИПЦИЯ ГОЛОСА
// ============================================

export async function transcribeAudio(
  audioBuffer: Buffer,
  durationSeconds: number,
  filename = 'audio.ogg'
): Promise<TranscriptionResponse> {
  const startTime = Date.now();
  
  try {
    aiLogger.debug({ durationSeconds, filename }, 'Starting audio transcription');
    
    // Создаём File-like объект из Buffer
    const audioFile = new File([audioBuffer], filename, { type: 'audio/ogg' });
    
    const response = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'ru',
      response_format: 'text',
    });
    
    const latencyMs = Date.now() - startTime;
    const costUsd = calculateAudioCost(durationSeconds);
    
    aiLogger.info({
      durationSeconds,
      textLength: response.length,
      costUsd,
      latencyMs,
    }, 'Audio transcription completed');
    
    return {
      text: response,
      durationSeconds,
      usage: {
        costUsd,
      },
    };
  } catch (error) {
    aiLogger.error({ error }, 'Audio transcription failed');
    throw error;
  }
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

/**
 * Скачать файл из Telegram и получить Buffer
 */
export async function downloadTelegramFile(
  fileUrl: string
): Promise<Buffer> {
  const response = await fetch(fileUrl);
  
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Полный pipeline: скачать голосовое + транскрибировать + проанализировать
 */
export async function processVoiceMessage(
  fileUrl: string,
  durationSeconds: number
): Promise<{
  transcription: TranscriptionResponse;
  analysis: AnalysisResponse;
  totalCostUsd: number;
}> {
  // 1. Скачиваем аудио
  const audioBuffer = await downloadTelegramFile(fileUrl);
  
  // 2. Транскрибируем
  const transcription = await transcribeAudio(audioBuffer, durationSeconds);
  
  // 3. Анализируем текст
  const analysis = await analyzeMood(transcription.text);
  
  const totalCostUsd = transcription.usage.costUsd + analysis.usage.costUsd;
  
  aiLogger.info({
    durationSeconds,
    textLength: transcription.text.length,
    totalCostUsd,
  }, 'Voice message processing completed');
  
  return {
    transcription,
    analysis,
    totalCostUsd,
  };
}

export default {
  analyzeMood,
  transcribeAudio,
  downloadTelegramFile,
  processVoiceMessage,
};
