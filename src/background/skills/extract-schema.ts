import { z } from 'zod';
import { LLMConfig, LLMMessage } from '../llm/types';
import { queryLLMRaw } from '../llm/client';
import { DOMState } from '../../content/types';

/**
 * Standard Due Diligence & Regulatory Company Profile Schema
 */
export const CompanyProfileSchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  registrationNumber: z.string().optional(),
  jurisdiction: z.string().optional(),
  incorporationDate: z.string().optional(),
  status: z.string().default('Unknown'),
  directors: z.array(z.string()).default([]),
  capital: z.union([z.string(), z.number()]).optional(),
  registeredAddress: z.string().optional(),
  sourceUrl: z.string().optional(),
});

export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

/**
 * Standard Financial Report / Filings Extraction Schema
 */
export const FinancialReportSchema = z.object({
  entityName: z.string().min(1, 'Entity name is required'),
  fiscalPeriod: z.string().min(1, 'Fiscal period is required'),
  currency: z.string().default('USD'),
  revenue: z.number().optional(),
  netIncome: z.number().optional(),
  totalAssets: z.number().optional(),
  totalLiabilities: z.number().optional(),
  keyMetrics: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
});

export type FinancialReport = z.infer<typeof FinancialReportSchema>;

export interface ExtractionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  rawText?: string;
}

/**
 * Strips markdown code fences (e.g. ```json ... ```) and excess whitespace.
 */
export function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenceRegex = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
  const match = trimmed.match(fenceRegex);
  if (match) {
    return match[1].trim();
  }
  return trimmed;
}

/**
 * Extracts structured data from page DOM state and verifies it against a Zod schema.
 */
export async function extractStructuredData<T>(
  config: LLMConfig,
  domState: DOMState,
  schema: z.ZodSchema<T>,
  instruction: string,
  signal?: AbortSignal,
): Promise<ExtractionResult<T>> {
  const pageProse = domState.textExcerpt?.slice(0, 8000) || '';
  const promptContext = domState.formattedPrompt?.slice(0, 4000) || '';

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `You are an exacting structured data extraction specialist.
Extract the requested entity from the page text and DOM representation.
Output ONLY a single, valid JSON object conforming to the user's requirements.
Do NOT enclose your output in markdown explanations or conversational text. Output pure JSON.`,
    },
    {
      role: 'user',
      content: `Target Instruction: ${instruction}
Page Title: ${domState.title}
Page URL: ${domState.url}

=== Page Visible Text ===
${pageProse}

=== Page Elements ===
${promptContext}

Extract the data as JSON conforming to the requested schema.`,
    },
  ];

  try {
    const raw = await queryLLMRaw(config, messages, signal);
    const cleaned = stripJsonFences(raw);

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(cleaned);
    } catch (parseErr: unknown) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      return {
        success: false,
        error: `Failed to parse JSON from model output: ${msg}. Output was: "${raw.slice(0, 150)}"`,
        rawText: raw,
      };
    }

    const validation = schema.safeParse(parsedJson);
    if (!validation.success) {
      const issues = validation.error.issues
        .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
        .join('; ');
      return {
        success: false,
        error: `Validation failed against schema: ${issues}`,
        rawText: raw,
      };
    }

    return {
      success: true,
      data: validation.data,
      rawText: raw,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Extraction error: ${msg}`,
    };
  }
}
