// ============================================================
// ChatModelManager — 国产大模型路由 + 多模态文件分析
// ============================================================
import { DeepSeekClient, type ChatOptions } from "../api";
import type { ChatMessage } from "../types";

export interface AnalyzeResult {
  text: string;
  method: "vision" | "extract";
  fileName: string;
  fileType: string;
}

// ---- Provider types ----

export type LLMProvider = "deepseek" | "qwen" | "glm" | "ollama";

export interface ProviderConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  headers?: Record<string, string>;
}

export interface VisionConfig {
  provider: "qwen-vl" | "glm-v";
  apiKey: string;
  baseUrl: string;
  model: string;
}

// ---- Manager ----

export class ChatModelManager {
  private providers = new Map<LLMProvider, ProviderConfig>();
  private deepseekClient: DeepSeekClient;
  private visionCfg: VisionConfig | null = null;

  constructor(
    baseUrl: string,
    apiKey: string,
    model: string,
    reasoningEffort = "medium",
  ) {
    this.deepseekClient = new DeepSeekClient(baseUrl, apiKey, model, reasoningEffort);
    this.providers.set("deepseek", { provider: "deepseek", apiKey, baseUrl, model });
  }

  // ---- Provider register ----

  registerProvider(config: ProviderConfig): void {
    this.providers.set(config.provider, config);
  }

  registerVision(config: VisionConfig): void {
    this.visionCfg = config;
  }

  getProviders(): LLMProvider[] {
    return [...this.providers.keys()];
  }

  updateDeepSeekConfig(baseUrl: string, apiKey: string, model: string, reasoningEffort?: string): void {
    this.deepseekClient.updateConfig(baseUrl, apiKey, model, reasoningEffort);
    this.providers.set("deepseek", { provider: "deepseek", apiKey, baseUrl, model });
  }

  hasVision(): boolean {
    return this.visionCfg !== null;
  }

  // ---- Chat ----

  async chat(
    messages: ChatMessage[],
    provider: LLMProvider = "deepseek",
    options: ChatOptions = {},
  ): Promise<string | AsyncGenerator<string, void, undefined>> {
    if (provider === "deepseek") {
      return this.deepseekClient.chat(messages, options);
    }
    const config = this.providers.get(provider);
    if (!config) throw new Error(`Provider "${provider}" not registered.`);
    return this.openAICompatibleChat(config, messages, options);
  }

  // ---- Vision chat (multimodal) ----

  async visionChat(
    imageBase64: string,
    imageType: string,
    prompt: string,
  ): Promise<string> {
    if (!this.visionCfg) throw new Error("多模态识别未配置。请在设置中配置视觉模型。");

    const { apiKey, baseUrl, model } = this.visionCfg;

    // OpenAI-compatible format with vision
    const body = JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${imageType};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 4096,
    });

    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    });

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      try {
        const raw = await response.text();
        errorMsg = JSON.parse(raw).error?.message || errorMsg;
      } catch { /* ignore */ }
      throw new Error(errorMsg);
    }

    const json = await response.json();
    return json.choices?.[0]?.message?.content || "";
  }

  // ---- 统一文件分析（图片/PDF/Word → 文本）----

  async analyzeFile(file: File): Promise<AnalyzeResult> {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const isImage = ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext || "");
    const isPdf = ext === "pdf";
    const isWord = ["docx", "doc"].includes(ext || "");

    // Image → vision model directly
    if (isImage) {
      const base64 = await this.fileToBase64(file);
      const text = await this.visionChat(base64, file.type, "请详细描述这张图片的内容。如果是图表，提取其中的数据和信息。如果是文字截图，逐字提取。用中文回答。");
      return { text, method: "vision", fileName: file.name, fileType: "image" };
    }

    // PDF → render first page → vision model
    if (isPdf) {
      try {
        const imgBase64 = await this.renderPdfPage(file);
        const text = await this.visionChat(imgBase64, "image/png", "请详细识别这份PDF的首页内容。提取标题、全部文字、表格数据。用中文回答。");
        return { text, method: "vision", fileName: file.name, fileType: "pdf" };
      } catch (e: any) {
        throw new Error(`PDF 识别失败: ${e.message}`);
      }
    }

    // Word → mammoth text extraction
    if (isWord) {
      try {
        const mammoth = await import("mammoth");
        const buf = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buf });
        return { text: result.value.slice(0, 8000), method: "extract", fileName: file.name, fileType: "word" };
      } catch (e: any) {
        throw new Error(`Word 解析失败: ${e.message}`);
      }
    }

    throw new Error(`不支持的文件类型: ${ext}。支持：图片 / PDF / Word`);
  }

  // ---- Helpers ----

  private async fileToBase64(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  private async renderPdfPage(file: File): Promise<string> {
    const pdfjsLib = await import("pdfjs-dist");
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;

    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL("image/png");
    return dataUrl.split(",")[1];
  }

  // ---- OpenAI-compatible (通义千问 / GLM / Ollama) ----

  private async openAICompatibleChat(
    config: ProviderConfig,
    messages: ChatMessage[],
    options: ChatOptions,
  ): Promise<string | AsyncGenerator<string, void, undefined>> {
    const { stream = false, signal, maxTokens } = options;

    const body = JSON.stringify({
      model: config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream,
      temperature: 0.7,
      top_p: 0.9,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      ...(config.headers || {}),
    };

    const baseUrl = config.baseUrl.replace(/\/+$/, "");
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body,
        signal,
      });
    } catch (err: unknown) {
      throw new Error(err instanceof Error ? err.message : "请求失败");
    }

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      try {
        const raw = await response.text();
        errorMsg = JSON.parse(raw).error?.message || errorMsg;
      } catch { /* ignore */ }
      throw new Error(errorMsg);
    }

    if (stream) return this.streamSSE(response);
    const json = await response.json();
    return json.choices?.[0]?.message?.content || "";
  }

  private async *streamSSE(response: Response): AsyncGenerator<string, void, undefined> {
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder("utf-8");
    let buf = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let start = 0, end: number;
        while ((end = buf.indexOf("\n", start)) !== -1) {
          let line = buf.slice(start, end).trim();
          start = end + 1;
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") { reader.releaseLock(); return; }
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch { /* skip */ }
        }
        buf = buf.slice(start);
      }
    } finally {
      reader.releaseLock();
    }
  }
}
