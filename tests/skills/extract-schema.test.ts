import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  extractStructuredData,
  CompanyProfileSchema,
  FinancialReportSchema,
  stripJsonFences,
} from '../../src/background/skills/extract-schema';
import { DOMState } from '../../src/content/types';
import { LLMConfig } from '../../src/background/llm/types';

vi.mock('../../src/background/llm/client', () => ({
  queryLLMRaw: vi.fn(),
}));

import { queryLLMRaw } from '../../src/background/llm/client';
const mockedQueryLLMRaw = vi.mocked(queryLLMRaw);

describe('Zod Structured Extraction Skill', () => {
  const mockConfig: LLMConfig = {
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: 'test-key',
  };

  const sampleDOM: DOMState = {
    url: 'https://registry.example.gov/company/12345',
    title: 'Acme Corp - Regulatory Filing',
    elements: [],
    formattedPrompt: 'Company: Acme Technologies Inc.\nStatus: Active\nReg: 12345678',
    textExcerpt:
      'Acme Technologies Inc. is a registered corporation in Delaware incorporated on 2018-05-12. Registered address: 100 Main St, Dover DE. Directors: Alice Smith, Bob Jones. Share capital: $1,000,000.',
    viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('stripJsonFences', () => {
    it('strips markdown code blocks and whitespace', () => {
      const raw = '```json\n{"name": "Test"}\n```';
      expect(stripJsonFences(raw)).toBe('{"name": "Test"}');
    });

    it('returns raw text if no code blocks exist', () => {
      expect(stripJsonFences('{"a": 1}')).toBe('{"a": 1}');
    });
  });

  describe('extractStructuredData', () => {
    it('successfully extracts and validates a CompanyProfile schema from page content', async () => {
      mockedQueryLLMRaw.mockResolvedValue(`\`\`\`json
{
  "name": "Acme Technologies Inc.",
  "registrationNumber": "12345678",
  "jurisdiction": "Delaware",
  "incorporationDate": "2018-05-12",
  "status": "Active",
  "directors": ["Alice Smith", "Bob Jones"],
  "capital": "$1,000,000",
  "registeredAddress": "100 Main St, Dover DE"
}
\`\`\``);

      const result = await extractStructuredData(
        mockConfig,
        sampleDOM,
        CompanyProfileSchema,
        'Extract regulatory company profile',
      );

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Acme Technologies Inc.');
      expect(result.data?.directors).toEqual(['Alice Smith', 'Bob Jones']);
      expect(result.data?.status).toBe('Active');
    });

    it('returns failure when LLM response violates schema validation', async () => {
      // Missing required "name" and "status"
      mockedQueryLLMRaw.mockResolvedValue(`{"jurisdiction": "Delaware"}`);

      const result = await extractStructuredData(
        mockConfig,
        sampleDOM,
        CompanyProfileSchema,
        'Extract company profile',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('returns failure when LLM response is not valid JSON', async () => {
      mockedQueryLLMRaw.mockResolvedValue(`Sorry, I could not find any company data.`);

      const result = await extractStructuredData(
        mockConfig,
        sampleDOM,
        CompanyProfileSchema,
        'Extract profile',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to parse JSON');
    });

    it('extracts custom user-provided schemas', async () => {
      const CustomSchema = z.object({
        price: z.number(),
        sku: z.string(),
      });

      mockedQueryLLMRaw.mockResolvedValue(`{"price": 49.99, "sku": "SKU-9900"}`);

      const result = await extractStructuredData(
        mockConfig,
        sampleDOM,
        CustomSchema,
        'Extract pricing',
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ price: 49.99, sku: 'SKU-9900' });
    });

    it('extracts FinancialReportSchema correctly', async () => {
      mockedQueryLLMRaw.mockResolvedValue(`{
        "entityName": "Acme Corp",
        "fiscalPeriod": "Q3 2025",
        "currency": "USD",
        "revenue": 5000000,
        "netIncome": 1200000,
        "keyMetrics": { "margin": "24%" }
      }`);

      const result = await extractStructuredData(
        mockConfig,
        sampleDOM,
        FinancialReportSchema,
        'Extract Q3 financials',
      );

      expect(result.success).toBe(true);
      expect(result.data?.entityName).toBe('Acme Corp');
      expect(result.data?.revenue).toBe(5000000);
    });
  });
});
