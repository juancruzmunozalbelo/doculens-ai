import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readmePath = path.join(repoRoot, 'README.md');

const requiredScenarios = Object.freeze(['Full-document analysis', 'RAG chat']);
const requiredTiers = Object.freeze([1_000, 10_000, 100_000]);
const estimateTableHeaders = Object.freeze([
  'Scenario',
  'Request tier',
  'Average input tokens/request',
  'Average output tokens/request',
  'Total input tokens',
  'Total output tokens',
  'Estimated provider cost',
]);

async function costSection() {
  const readme = await readFile(readmePath, 'utf8');
  const match = readme.match(/## AI usage cost estimation\n(?<section>[\s\S]*?)\n## Local quick start/);
  assert.ok(match?.groups?.section, 'README must include a repo-local AI usage cost estimation section before Local quick start');
  return match.groups.section;
}

function normalizeText(value) {
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function assertSectionIncludes(section, required, message) {
  assert.ok(normalizeText(section).includes(normalizeText(required)), message ?? `cost-estimation section missing: ${required}`);
}

function parseInteger(value, label) {
  const number = Number(String(value).replace(/,/g, ''));
  assert.ok(Number.isSafeInteger(number) && number >= 0, `${label} must be a non-negative integer`);
  return number;
}

function parseRequestTierCell(value) {
  const trimmed = String(value).trim();
  assert.match(trimmed, /^\d[\d,]*$/, `request tier must be an integer without a token unit: ${trimmed}`);
  return parseInteger(trimmed, `request tier ${trimmed}`);
}

function parseTokenCell(value, label) {
  const trimmed = String(value).trim();
  assert.match(trimmed, /^\d[\d,]* tokens$/, `${label} must include a numeric token count and "tokens" unit`);
  return parseInteger(trimmed.replace(/ tokens$/, ''), label);
}

function parseCurrencyCell(value, label) {
  const trimmed = String(value).trim();
  const match = trimmed.match(/^\$(?<dollars>\d[\d,]*)(?:\.(?<cents>\d{2}))$/);
  assert.ok(match?.groups, `${label} must be a USD amount with two decimal places`);
  return parseInteger(match.groups.dollars, `${label} dollars`) * 100 + Number(match.groups.cents);
}

function parsePricingAssumptions(section) {
  const match = section.match(
    /Unit prices: \$(?<inputRate>\d+(?:\.\d+)?) per 1M input tokens and \$(?<outputRate>\d+(?:\.\d+)?) per 1M output tokens\./,
  );
  assert.ok(match?.groups, 'pricing assumptions must document USD input and output token rates per 1M tokens');
  return {
    inputRateUsdPerMillion: Number(match.groups.inputRate),
    outputRateUsdPerMillion: Number(match.groups.outputRate),
  };
}

function parseFormulaRates(section) {
  const match = section.match(
    /Formula: `total_input_tokens = requests \* average_input_tokens`; `total_output_tokens = requests \* average_output_tokens`; `estimated_provider_cost_usd = \(total_input_tokens \/ 1_000_000 \* (?<inputRate>\d+(?:\.\d+)?)\) \+ \(total_output_tokens \/ 1_000_000 \* (?<outputRate>\d+(?:\.\d+)?)\)`\./,
  );
  assert.ok(match?.groups, 'formula must show token totals and provider cost calculation with documented rates');
  return {
    inputRateUsdPerMillion: Number(match.groups.inputRate),
    outputRateUsdPerMillion: Number(match.groups.outputRate),
  };
}

function parseScenarioAverages(section) {
  const scenarios = new Map();
  const scenarioPattern =
    /^- (?<scenario>RAG chat|Full-document analysis) request: (?<averageInput>\d[\d,]*) average input tokens and (?<averageOutput>\d[\d,]*) average output tokens\. (?<description>[^\n]+)$/gm;
  for (const match of section.matchAll(scenarioPattern)) {
    const { scenario, averageInput, averageOutput, description } = match.groups;
    assert.equal(scenarios.has(scenario), false, `scenario average documented more than once: ${scenario}`);
    assert.match(description, /\S/, `${scenario} must disclose what the representative request covers`);
    scenarios.set(scenario, {
      averageInputTokens: parseInteger(averageInput, `${scenario} average input tokens`),
      averageOutputTokens: parseInteger(averageOutput, `${scenario} average output tokens`),
      description,
    });
  }
  assert.deepEqual(
    [...scenarios.keys()].sort(),
    [...requiredScenarios],
    'README must disclose separate representative RAG chat and full-document analysis request scenarios',
  );
  return scenarios;
}

function parseMarkdownRow(line, label) {
  assert.match(line, /^\|.*\|$/, `${label} must be a Markdown table row`);
  return line.split('|').slice(1, -1).map((cell) => cell.trim());
}

function parseEstimateRows(section) {
  const lines = section.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.startsWith('| Scenario | Request tier |'));
  assert.notEqual(headerIndex, -1, 'cost-estimation section must include the request-volume estimate table');
  assert.deepEqual(parseMarkdownRow(lines[headerIndex], 'estimate table header'), estimateTableHeaders);
  assert.deepEqual(
    parseMarkdownRow(lines[headerIndex + 1], 'estimate table separator'),
    ['---', '---:', '---:', '---:', '---:', '---:', '---:'],
    'estimate table must right-align numeric columns',
  );

  const rows = new Map();
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.startsWith('|')) break;
    const [scenario, tier, averageInput, averageOutput, totalInput, totalOutput, estimatedCost] = parseMarkdownRow(
      line,
      'estimate table body',
    );
    assert.ok(requiredScenarios.includes(scenario), `unexpected estimate scenario row: ${scenario}`);
    const requestTier = parseRequestTierCell(tier);
    const key = `${scenario}:${requestTier}`;
    assert.equal(rows.has(key), false, `duplicate estimate row for ${scenario} at ${requestTier} requests`);
    rows.set(key, {
      scenario,
      tier: requestTier,
      averageInputTokens: parseTokenCell(averageInput, `${scenario} ${requestTier} average input`),
      averageOutputTokens: parseTokenCell(averageOutput, `${scenario} ${requestTier} average output`),
      totalInputTokens: parseTokenCell(totalInput, `${scenario} ${requestTier} total input`),
      totalOutputTokens: parseTokenCell(totalOutput, `${scenario} ${requestTier} total output`),
      estimatedCostCents: parseCurrencyCell(estimatedCost, `${scenario} ${requestTier} estimated provider cost`),
    });
  }
  return rows;
}

function expectedCostCents({ totalInputTokens, totalOutputTokens }, pricing) {
  const costUsd =
    (totalInputTokens / 1_000_000) * pricing.inputRateUsdPerMillion +
    (totalOutputTokens / 1_000_000) * pricing.outputRateUsdPerMillion;
  return Math.round((costUsd + Number.EPSILON) * 100);
}

test('README documents reproducible MiniMax M3 pricing, formula, scenarios, and caveats', async () => {
  const section = await costSection();
  const pricing = parsePricingAssumptions(section);
  const formulaRates = parseFormulaRates(section);
  const scenarios = parseScenarioAverages(section);

  assert.deepEqual(formulaRates, pricing, 'formula rates must match the documented MiniMax unit prices');
  assert.match(section, /Pricing assumptions, captured on \d{4}-\d{2}-\d{2}:/, 'pricing assumptions must be dated');
  assert.match(section, /Model: `MiniMax-M3`/, 'pricing assumptions must name the MiniMax M3 model');

  for (const required of [
    'USD pay-as-you-go text tokens',
    'uncached standard service tier',
    '512k input-token row',
    'Sources:',
    'AI//COST',
    'Puter',
    '2026-06-08',
    'fixed planning assumptions',
    'not live billing data',
    'Prompt-cache reads',
    'long-context >512k pricing',
    'speech, image, video, and music meters are excluded',
  ]) {
    assertSectionIncludes(section, required, `pricing/source coverage missing: ${required}`);
  }

  assert.match(
    scenarios.get('RAG chat').description,
    /prompt wrapper.*retrieved context.*question.*answer/i,
    'RAG chat scenario must disclose the request contents represented by the average',
  );
  assert.match(
    scenarios.get('Full-document analysis').description,
    /server input\/context and output token caps/i,
    'full-document analysis scenario must disclose that the average is bounded by current token caps',
  );

  for (const required of [
    'MiniMax tokenizer behavior',
    'document length',
    'retrieved chunk volume',
    'answer length',
    'retry behavior',
    'provider pricing changes',
    'cache usage',
    'service tier',
    'long-context routing',
    'failed requests',
    'unsupported requests',
    'representative averages',
    'repo token-estimation heuristics',
    'not billing reconciliation',
    'Streaming responses, LLM tool/function calling, and queue/worker processing remain out of scope',
  ]) {
    assertSectionIncludes(section, required, `caveat coverage missing: ${required}`);
  }
});

test('README cost table arithmetic matches documented rates, averages, units, and request tiers', async () => {
  const section = await costSection();
  const pricing = parsePricingAssumptions(section);
  const scenarios = parseScenarioAverages(section);
  const rows = parseEstimateRows(section);

  assert.equal(
    rows.size,
    requiredScenarios.length * requiredTiers.length,
    'cost table must include exactly one row for each required scenario/tier combination',
  );

  for (const scenario of requiredScenarios) {
    for (const tier of requiredTiers) {
      const row = rows.get(`${scenario}:${tier}`);
      assert.ok(row, `missing estimate row for ${scenario} at ${tier} requests`);
      const scenarioAverage = scenarios.get(scenario);
      const expectedTotalInputTokens = tier * scenarioAverage.averageInputTokens;
      const expectedTotalOutputTokens = tier * scenarioAverage.averageOutputTokens;

      assert.equal(row.averageInputTokens, scenarioAverage.averageInputTokens, `${scenario} ${tier} input average drifted from scenario disclosure`);
      assert.equal(row.averageOutputTokens, scenarioAverage.averageOutputTokens, `${scenario} ${tier} output average drifted from scenario disclosure`);
      assert.equal(row.totalInputTokens, expectedTotalInputTokens, `${scenario} ${tier} total input tokens must equal tier * average input`);
      assert.equal(row.totalOutputTokens, expectedTotalOutputTokens, `${scenario} ${tier} total output tokens must equal tier * average output`);
      assert.equal(
        row.estimatedCostCents,
        expectedCostCents(
          { totalInputTokens: expectedTotalInputTokens, totalOutputTokens: expectedTotalOutputTokens },
          pricing,
        ),
        `${scenario} ${tier} provider cost must be calculated from documented token totals and rates`,
      );
    }
  }
});

test('README connects estimates to fail-closed MiniMax budget guardrails before transport', async () => {
  const section = await costSection();

  for (const required of [
    'Budget guardrails already bound live spend before MiniMax transport invocation',
    'caps live calls at 32',
    'input tokens at 8,000',
    'context tokens at 8,000',
    'output-token budget ceiling at 6,000',
    'Normal chat requests default to 800 output tokens',
    'timeout at 30,000 ms',
    'retries at 1',
    'concurrency at 2',
    'max estimated live-call cost at $1',
    'provider rejects exhausted live-call budgets',
    'over-limit input/context tokens',
    'over-limit output tokens',
    'exceeded estimated-cost budgets',
    'invalid timeout/retry budgets',
    'concurrency overflow before the network call is made',
    'Over-budget requests fail closed before MiniMax transport invocation',
  ]) {
    assertSectionIncludes(section, required, `budget guardrail coverage missing: ${required}`);
  }
});

test('cost-estimation verification reads only the repo-local README without network access', async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  globalThis.fetch = (...args) => {
    fetchCalls.push(args);
    throw new Error('cost-estimation verification must not fetch live pricing, MiniMax, or remote wiki content');
  };

  try {
    const section = await costSection();
    const rows = parseEstimateRows(section);
    assert.equal(path.relative(repoRoot, readmePath), 'README.md', 'verification must read the repo-local README path');
    assert.equal(rows.size > 0, true, 'repo-local README must contain parseable cost-estimation rows');
    assertSectionIncludes(section, 'local verification does not depend on private or remote wiki content');
  } finally {
    if (originalFetch === undefined) {
      delete globalThis.fetch;
    } else {
      globalThis.fetch = originalFetch;
    }
  }

  assert.deepEqual(fetchCalls, [], 'cost-estimation verification must not perform network fetches');
});
