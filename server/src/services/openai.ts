import OpenAI from 'openai';
import { aiLogger } from '../utils/logger.js';
import { calculateTextCost, calculateAudioCost, type AIProvider } from '../utils/pricing.js';
import { configService } from './config.js';
import { DEFAULT_MOOD_ANALYSIS, validateMoodScoreRange } from '../config/ai-constants.js';

// ============================================
// AI CLIENTS INITIALIZATION
// ============================================

// OpenAI client for Whisper (audio transcription)
const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  throw new Error('OPENAI_API_KEY environment variable is required');
}

const audioClient = new OpenAI({
  apiKey: openaiApiKey,
  maxRetries: 3,
  timeout: 60000,
});

// DeepSeek client for chat (mood analysis)
// Falls back to OpenAI if DEEPSEEK_API_KEY is not set
const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
const chatClient = deepseekApiKey
  ? new OpenAI({
      apiKey: deepseekApiKey,
      baseURL: 'https://api.deepseek.com',
      maxRetries: 3,
      timeout: 60000,
    })
  : audioClient; // fallback to OpenAI

const chatProvider: AIProvider = deepseekApiKey ? 'deepseek' : 'openai';
aiLogger.info({ chatProvider }, 'AI clients initialized');

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
    model: string;
    provider: AIProvider;
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
  model: string;
  provider: AIProvider;
}> {
  // Use DeepSeek model if available, otherwise OpenAI
  const defaultModel = deepseekApiKey ? 'deepseek-chat' : 'gpt-4o-mini';
  
  const [systemPrompt, baseTemperature, maxTokens, model] = await Promise.all([
    configService.getString('ai.system_prompt', DEFAULT_SYSTEM_PROMPT),
    configService.getNumber('ai.temperature', 0.7),
    configService.getNumber('ai.max_tokens', 500),
    configService.getString('ai.default_model', defaultModel),
  ]);

  // DeepSeek works better with higher temperature (1.3)
  // OpenAI uses configured temperature (default 0.7)
  const temperature = chatProvider === 'deepseek' ? 1.3 : baseTemperature;

  return {
    systemPrompt,
    temperature,
    maxTokens,
    model,
    provider: chatProvider,
  };
}

// ============================================
// АНАЛИЗ ТЕКСТА
// ============================================

export async function analyzeMood(
  text: string,
  modelOverride?: string
): Promise<AnalysisResponse> {
  const startTime = Date.now();
  
  try {
    // Get dynamic config
    const settings = await getAISettings();
    const model = modelOverride || settings.model;
    
    aiLogger.debug({ textLength: text.length, model, provider: settings.provider }, 'Starting mood analysis');
    
    const response = await chatClient.chat.completions.create({
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
      result = { ...DEFAULT_MOOD_ANALYSIS };
    }
    
    // Валидация moodScore
    result.moodScore = validateMoodScoreRange(result.moodScore);
    
    const inputTokens = usage?.prompt_tokens || 0;
    const outputTokens = usage?.completion_tokens || 0;
    const costUsd = calculateTextCost(model, inputTokens, outputTokens, settings.provider);
    
    aiLogger.info({
      moodScore: result.moodScore,
      moodLabel: result.moodLabel,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
      provider: settings.provider,
    }, 'Mood analysis completed');
    
    return {
      result,
      usage: {
        inputTokens,
        outputTokens,
        costUsd,
        model,
        provider: settings.provider,
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
    
    // Always use OpenAI for Whisper (best quality)
    const response = await audioClient.audio.transcriptions.create({
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
