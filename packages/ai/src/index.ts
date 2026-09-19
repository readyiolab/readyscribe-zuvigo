import OpenAI from "openai";
import type { AppConfig } from "@zuvigo/config";
import { AIError } from "@zuvigo/security";

export interface GuideStepInput {
  title: string;
  description: string;
}

export interface GeneratedGuide {
  title: string;
  summary: string;
  steps: GuideStepInput[];
  tips?: string[];
}

export interface AIService {
  generateTitle(steps: GuideStepInput[]): Promise<string>;
  generateStepDescription(context: {
    title: string;
    elementLabel?: string;
    url?: string;
  }): Promise<string>;
  summarizeWorkflow(steps: GuideStepInput[]): Promise<string>;
  generateGuide(steps: GuideStepInput[], context?: { sourceUrl?: string }): Promise<GeneratedGuide>;
  rewriteStep(step: GuideStepInput, instruction: string): Promise<GuideStepInput>;
}

export class OpenAIService implements AIService {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, opts?: { baseURL?: string; model?: string }) {
    this.client = new OpenAI({
      apiKey,
      baseURL: opts?.baseURL,
      timeout: 60_000,
      maxRetries: 2,
    });
    this.model = opts?.model ?? "gpt-4o-mini";
  }

  private async chatJson<T>(system: string, user: string): Promise<T> {
    try {
      const res = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      const content = res.choices[0]?.message?.content;
      if (!content) throw new AIError("Empty AI response");
      return JSON.parse(content) as T;
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError((err as Error).message);
    }
  }

  async generateTitle(steps: GuideStepInput[]): Promise<string> {
    const result = await this.chatJson<{ title: string }>(
      "You write concise titles for step-by-step software guides. Return JSON {title}.",
      JSON.stringify({ steps }),
    );
    return result.title;
  }

  async generateStepDescription(context: {
    title: string;
    elementLabel?: string;
    url?: string;
  }): Promise<string> {
    const result = await this.chatJson<{ description: string }>(
      "Write a clear imperative step description for a SOP guide. Never invent credentials. Return JSON {description}.",
      JSON.stringify(context),
    );
    return result.description;
  }

  async summarizeWorkflow(steps: GuideStepInput[]): Promise<string> {
    const result = await this.chatJson<{ summary: string }>(
      "Summarize this workflow in 1-2 sentences. Return JSON {summary}.",
      JSON.stringify({ steps }),
    );
    return result.summary;
  }

  async generateGuide(
    steps: GuideStepInput[],
    context?: { sourceUrl?: string },
  ): Promise<GeneratedGuide> {
    return this.chatJson<GeneratedGuide>(
      `You transform raw workflow steps into a polished SOP guide.
Rules:
- Improve titles and descriptions; keep step count similar
- Never include passwords, tokens, or secrets
- Use clear imperative language
- Return JSON {title, summary, steps:[{title,description}], tips?:string[]}`,
      JSON.stringify({ steps, context }),
    );
  }

  async rewriteStep(step: GuideStepInput, instruction: string): Promise<GuideStepInput> {
    return this.chatJson<GuideStepInput>(
      "Rewrite the step per instruction. Return JSON {title, description}.",
      JSON.stringify({ step, instruction }),
    );
  }
}

/** Passthrough when AI is disabled — keeps product functional. */
export class HeuristicAIService implements AIService {
  async generateTitle(steps: GuideStepInput[]): Promise<string> {
    return steps[0]?.title ? `Guide: ${steps[0].title}` : "Untitled guide";
  }

  async generateStepDescription(context: { title: string }): Promise<string> {
    return context.title;
  }

  async summarizeWorkflow(steps: GuideStepInput[]): Promise<string> {
    return `A ${steps.length}-step workflow guide.`;
  }

  async generateGuide(steps: GuideStepInput[]): Promise<GeneratedGuide> {
    return {
      title: await this.generateTitle(steps),
      summary: await this.summarizeWorkflow(steps),
      steps,
    };
  }

  async rewriteStep(step: GuideStepInput): Promise<GuideStepInput> {
    return step;
  }
}

export function createAIService(config: AppConfig): AIService {
  if (config.aiEnabled && config.AI_API_KEY) {
    return new OpenAIService(config.AI_API_KEY, {
      baseURL: config.AI_BASE_URL,
      model: config.AI_MODEL,
    });
  }
  return new HeuristicAIService();
}
