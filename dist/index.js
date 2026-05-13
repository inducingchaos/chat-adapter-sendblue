// src/adapter.ts
import { ConsoleLogger, Message, parseMarkdown, stringifyMarkdown } from "chat";
import SendblueAPI from "sendblue";

// src/format-converter.ts
function toPlainText(text) {
  const urlPlaceholders = [];
  let result = text.replace(/https?:\/\/[^\s)>\]]+/g, (url) => {
    urlPlaceholders.push(url);
    return `%%URLPH${urlPlaceholders.length - 1}%%`;
  }).replace(/```[\s\S]*?```/g, (m) => m.replace(/```(\w*\n?)?/g, "").trim()).replace(/`([^`]+)`/g, "$1").replace(/\*\*\*(.+?)\*\*\*/g, "$1").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/(?<!\w)_(.+?)_(?!\w)/g, "$1").replace(/~~(.+?)~~/g, "$1").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)").replace(/^#{1,6}\s+/gm, "").replace(/^[-*_]{3,}$/gm, "").replace(/^[\s]*[-*+]\s+/gm, "\u2022 ").trim();
  result = result.replace(
    /%%URLPH(\d+)%%/g,
    (_, idx) => urlPlaceholders[Number(idx)]
  );
  return result;
}

// src/types.ts
var VALID_REACTIONS = /* @__PURE__ */ new Set([
  "love",
  "like",
  "dislike",
  "laugh",
  "emphasize",
  "question"
]);
var REACTION_ALIASES = {
  heart: "love",
  thumbs_up: "like",
  thumbsup: "like",
  "+1": "like",
  thumbs_down: "dislike",
  thumbsdown: "dislike",
  "-1": "dislike",
  haha: "laugh",
  exclamation: "emphasize",
  "!!": "emphasize",
  "?": "question"
};

// src/adapter.ts
var DEFAULT_WEBHOOK_SECRET_HEADER = "sb-signing-secret";
var DEFAULT_ALLOWED_SERVICES = ["iMessage"];
var SendblueAdapter = class {
  name = "sendblue";
  persistMessageHistory = true;
  userName;
  chat = null;
  logger;
  config;
  sdk;
  constructor(config) {
    this.config = config;
    this.userName = "midday";
    this.logger = config.logger ?? new ConsoleLogger();
    this.sdk = new SendblueAPI({
      apiKey: config.apiKey,
      apiSecret: config.apiSecret
    });
  }
  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  async initialize(chat) {
    this.chat = chat;
    this.logger = chat.getLogger("sendblue");
    this.logger.info("Sendblue adapter initialized");
  }
  async disconnect() {
    this.logger.info("Sendblue adapter disconnected");
  }
  // ---------------------------------------------------------------------------
  // Thread ID encode / decode
  // ---------------------------------------------------------------------------
  encodeThreadId(data) {
    const from = Buffer.from(data.fromNumber).toString("base64url");
    if (data.groupId) {
      const group = Buffer.from(data.groupId).toString("base64url");
      return `sendblue:${from}:g:${group}`;
    }
    const contact = Buffer.from(data.contactNumber ?? "").toString("base64url");
    return `sendblue:${from}:${contact}`;
  }
  decodeThreadId(threadId) {
    const parts = threadId.split(":");
    if (parts.length < 3 || parts[0] !== "sendblue") {
      throw new Error(`Invalid Sendblue thread ID: ${threadId}`);
    }
    const fromNumber = Buffer.from(parts[1], "base64url").toString();
    if (parts[2] === "g" && parts[3]) {
      return {
        fromNumber,
        groupId: Buffer.from(parts[3], "base64url").toString()
      };
    }
    return {
      fromNumber,
      contactNumber: Buffer.from(parts[2], "base64url").toString()
    };
  }
  // ---------------------------------------------------------------------------
  // Webhook handling
  // ---------------------------------------------------------------------------
  async handleWebhook(request, options) {
    if (this.config.webhookSecret) {
      const headerName = this.config.webhookSecretHeader ?? DEFAULT_WEBHOOK_SECRET_HEADER;
      const headerValue = request.headers.get(headerName);
      if (headerValue !== this.config.webhookSecret) {
        this.logger.warn("Sendblue webhook secret mismatch", {
          header: headerName
        });
        return new Response("Unauthorized", { status: 401 });
      }
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    if ("is_typing" in body && typeof body.is_typing === "boolean") {
      this.handleTypingWebhook(body);
      return new Response("OK", { status: 200 });
    }
    if ("message_handle" in body && typeof body.message_handle === "string") {
      const payload = body;
      this.logger.info("Sendblue webhook message received", {
        is_outbound: payload.is_outbound,
        status: payload.status,
        hasContent: !!payload.content,
        hasMediaUrl: !!payload.media_url,
        mediaUrlPrefix: payload.media_url?.slice(0, 50),
        service: payload.service
      });
      if (!this.isServiceAllowed(payload.service)) {
        this.logger.debug("Sendblue webhook filtered by service", {
          service: payload.service
        });
        return new Response("OK", { status: 200 });
      }
      if (!payload.is_outbound && payload.status === "RECEIVED") {
        await this.processInboundMessage(payload, options);
      }
      return new Response("OK", { status: 200 });
    }
    this.logger.debug("Sendblue webhook ignored (unrecognized type)", {
      keys: Object.keys(body)
    });
    return new Response("OK", { status: 200 });
  }
  async processInboundMessage(payload, options) {
    if (!this.chat) return;
    const threadId = this.threadIdFromPayload(payload);
    this.markRead(threadId).catch(() => {
    });
    const factory = async () => {
      return this.parseMessage(payload);
    };
    this.chat.processMessage(this, threadId, factory, options);
  }
  handleTypingWebhook(payload) {
    this.logger.debug("Sendblue typing indicator", {
      number: payload.number,
      isTyping: payload.is_typing
    });
  }
  // ---------------------------------------------------------------------------
  // Message parsing
  // ---------------------------------------------------------------------------
  parseMessage(raw) {
    const threadId = this.threadIdFromPayload(raw);
    const text = raw.content ?? "";
    const attachments = [];
    if (raw.media_url && raw.media_url.length > 0) {
      attachments.push(this.buildAttachment(raw.media_url));
    }
    return new Message({
      id: raw.message_handle,
      threadId,
      text,
      formatted: parseMarkdown(text),
      raw,
      author: {
        userId: raw.is_outbound ? raw.from_number ?? "bot" : raw.from_number,
        userName: raw.is_outbound ? raw.from_number ?? "bot" : raw.from_number,
        fullName: "",
        isBot: raw.is_outbound,
        isMe: raw.is_outbound
      },
      metadata: {
        dateSent: new Date(raw.date_sent),
        edited: false
      },
      isMention: !raw.is_outbound,
      attachments
    });
  }
  // ---------------------------------------------------------------------------
  // Sending messages
  // ---------------------------------------------------------------------------
  async postMessage(threadId, message) {
    const decoded = this.decodeThreadId(threadId);
    const text = this.renderOutbound(message);
    if (!text?.trim()) {
      this.logger.debug("Skipping empty outbound message");
      return {
        raw: {},
        id: "",
        threadId
      };
    }
    let response;
    if (decoded.groupId) {
      response = await this.sdk.groups.sendMessage({
        from_number: decoded.fromNumber,
        content: text,
        group_id: decoded.groupId
      });
    } else {
      response = await this.sdk.messages.send({
        number: decoded.contactNumber,
        from_number: decoded.fromNumber,
        content: text,
        media_url: void 0,
        status_callback: this.config.statusCallbackUrl
      });
    }
    return {
      raw: response,
      id: response.message_handle ?? "",
      threadId
    };
  }
  async sendMediaMessage(threadId, mediaUrl, content) {
    const decoded = this.decodeThreadId(threadId);
    if (decoded.groupId) return;
    await this.sdk.messages.send({
      number: decoded.contactNumber,
      from_number: decoded.fromNumber,
      content: content ?? "",
      media_url: mediaUrl,
      status_callback: this.config.statusCallbackUrl
    });
  }
  async stream(threadId, textStream, _options) {
    let lastResult;
    let current = "";
    for await (const chunk of textStream) {
      let text = "";
      if (typeof chunk === "string") {
        text = chunk;
      } else if (chunk.type === "markdown_text") {
        text = chunk.text;
      }
      if (!text) continue;
      current += text;
      const parts = current.split("\n\n");
      if (parts.length > 1) {
        for (let i = 0; i < parts.length - 1; i++) {
          const seg = parts[i].trim();
          if (seg) {
            lastResult = await this.postMessage(threadId, { markdown: seg });
          }
        }
        current = parts[parts.length - 1];
      }
    }
    if (current.trim()) {
      lastResult = await this.postMessage(threadId, {
        markdown: current.trim()
      });
    }
    if (!lastResult) {
      this.logger.debug("Stream produced no content, skipping send");
      return { raw: {}, id: "", threadId };
    }
    return lastResult;
  }
  async editMessage(_threadId, _messageId, _message) {
    throw new Error(
      "Sendblue does not support message editing. iMessage messages cannot be edited via API."
    );
  }
  async deleteMessage(_threadId, _messageId) {
    this.logger.warn(
      "Sendblue deleteMessage is a soft-delete only \u2014 it does not unsend on the recipient's device"
    );
  }
  // ---------------------------------------------------------------------------
  // Reactions (not in official SDK — use raw HTTP)
  // ---------------------------------------------------------------------------
  async addReaction(threadId, messageId, emoji) {
    const decoded = this.decodeThreadId(threadId);
    const emojiName = typeof emoji === "string" ? emoji : emoji.name;
    const reaction = this.resolveReaction(emojiName);
    if (!reaction) {
      this.logger.warn("Unsupported Sendblue reaction, ignoring", {
        emoji: emojiName
      });
      return;
    }
    await this.sdk.post("/api/send-reaction", {
      body: {
        from_number: decoded.fromNumber,
        message_handle: messageId,
        reaction
      }
    });
  }
  async removeReaction(_threadId, _messageId, _emoji) {
    this.logger.debug("Sendblue does not support removing reactions via API");
  }
  // ---------------------------------------------------------------------------
  // Fetching
  // ---------------------------------------------------------------------------
  async fetchMessages(threadId, options) {
    const decoded = this.decodeThreadId(threadId);
    const limit = options?.limit ?? 20;
    const offset = options?.cursor != null ? Number.parseInt(options.cursor, 10) : 0;
    const result = await this.sdk.messages.list({
      limit,
      offset,
      order_by: "sentAt",
      order_direction: "desc",
      number: decoded.contactNumber,
      sendblue_number: decoded.fromNumber,
      group_id: decoded.groupId,
      message_type: decoded.groupId ? "group" : "message"
    });
    const messages = (result.data ?? []).map((raw) => this.parseMessage(raw)).reverse();
    const total = result.pagination?.total ?? 0;
    const nextOffset = offset + limit;
    const nextCursor = nextOffset < total ? String(nextOffset) : void 0;
    return { messages, nextCursor };
  }
  async fetchThread(threadId) {
    const decoded = this.decodeThreadId(threadId);
    return {
      id: threadId,
      channelId: this.channelIdFromThreadId(threadId),
      isDM: !decoded.groupId,
      metadata: {
        fromNumber: decoded.fromNumber,
        contactNumber: decoded.contactNumber,
        groupId: decoded.groupId
      }
    };
  }
  // ---------------------------------------------------------------------------
  // Typing
  // ---------------------------------------------------------------------------
  async startTyping(threadId) {
    const decoded = this.decodeThreadId(threadId);
    if (!decoded.contactNumber) {
      this.logger.debug(
        "Sendblue typing indicators not supported for group threads"
      );
      return;
    }
    try {
      await this.sdk.typingIndicators.send({
        number: decoded.contactNumber,
        from_number: decoded.fromNumber
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("No route mapping")) {
        this.logger.debug(
          "Sendblue typing indicator skipped: no route mapping",
          { number: decoded.contactNumber }
        );
        return;
      }
      throw error;
    }
  }
  // ---------------------------------------------------------------------------
  // Sendblue-specific helpers (not part of Adapter interface)
  // ---------------------------------------------------------------------------
  async markRead(threadId) {
    const decoded = this.decodeThreadId(threadId);
    if (!decoded.contactNumber) return;
    await this.sdk.post("/api/mark-read", {
      body: {
        number: decoded.contactNumber,
        from_number: decoded.fromNumber
      }
    });
  }
  async evaluateService(number) {
    return this.sdk.lookups.lookupNumber({ number });
  }
  async listLines() {
    return this.sdk.get("/api/lines");
  }
  /** Direct access to the official Sendblue SDK client */
  getSdk() {
    return this.sdk;
  }
  // ---------------------------------------------------------------------------
  // Channel ID
  // ---------------------------------------------------------------------------
  channelIdFromThreadId(threadId) {
    const parts = threadId.split(":");
    return `${parts[0]}:${parts[1]}`;
  }
  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------
  renderFormatted(content) {
    return toPlainText(stringifyMarkdown(content));
  }
  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------
  renderOutbound(message) {
    if (typeof message === "string") return toPlainText(message);
    if ("markdown" in message && typeof message.markdown === "string") {
      return toPlainText(message.markdown);
    }
    if ("text" in message && typeof message.text === "string") {
      return toPlainText(message.text);
    }
    if ("ast" in message && message.ast) {
      return toPlainText(stringifyMarkdown(message.ast));
    }
    return "";
  }
  threadIdFromPayload(payload) {
    const fromNumber = payload.sendblue_number ?? (payload.is_outbound ? payload.from_number : payload.to_number);
    if (payload.group_id && payload.group_id.length > 0) {
      return this.encodeThreadId({ fromNumber, groupId: payload.group_id });
    }
    const contactNumber = payload.is_outbound ? payload.to_number : payload.from_number;
    return this.encodeThreadId({ fromNumber, contactNumber });
  }
  isServiceAllowed(service) {
    const allowed = this.config.allowedServices ?? DEFAULT_ALLOWED_SERVICES;
    return allowed.some((s) => s.toLowerCase() === service.toLowerCase());
  }
  resolveReaction(name) {
    const lower = name.toLowerCase();
    if (VALID_REACTIONS.has(lower)) return lower;
    return REACTION_ALIASES[lower] ?? null;
  }
  buildAttachment(mediaUrl) {
    const IMAGE_EXTS = /* @__PURE__ */ new Set(["jpg", "jpeg", "png", "gif", "heic", "webp"]);
    if (mediaUrl.startsWith("data:")) {
      const commaIdx = mediaUrl.indexOf(",");
      if (commaIdx !== -1) {
        const header = mediaUrl.slice(5, commaIdx);
        const mime = header.replace(";base64", "") || "application/octet-stream";
        const ext2 = mime.split("/")[1] ?? "bin";
        const decoded = Buffer.from(mediaUrl.slice(commaIdx + 1), "base64");
        return {
          type: mime.startsWith("image/") ? "image" : "file",
          name: `attachment.${ext2}`,
          mimeType: mime,
          data: decoded,
          fetchData: async () => decoded
        };
      }
    }
    const ext = mediaUrl.split(".").pop()?.toLowerCase() ?? "";
    const isImage = IMAGE_EXTS.has(ext);
    return {
      type: isImage ? "image" : "file",
      name: mediaUrl.split("/").pop() ?? "attachment",
      mimeType: isImage ? `image/${ext === "jpg" ? "jpeg" : ext}` : "application/octet-stream",
      url: mediaUrl,
      fetchData: async () => {
        const res = await fetch(mediaUrl);
        return Buffer.from(await res.arrayBuffer());
      }
    };
  }
};

// src/index.ts
function createSendblueAdapter(config) {
  const apiKey = config?.apiKey ?? process.env.SENDBLUE_API_KEY;
  const apiSecret = config?.apiSecret ?? process.env.SENDBLUE_API_SECRET;
  const defaultFromNumber = config?.defaultFromNumber ?? process.env.SENDBLUE_FROM_NUMBER;
  if (!apiKey) {
    throw new Error(
      "Sendblue API key is required. Pass it in config or set SENDBLUE_API_KEY."
    );
  }
  if (!apiSecret) {
    throw new Error(
      "Sendblue API secret is required. Pass it in config or set SENDBLUE_API_SECRET."
    );
  }
  if (!defaultFromNumber) {
    throw new Error(
      "Sendblue from_number is required. Pass it in config or set SENDBLUE_FROM_NUMBER."
    );
  }
  return new SendblueAdapter({
    apiKey,
    apiSecret,
    defaultFromNumber,
    webhookSecret: config?.webhookSecret ?? process.env.SENDBLUE_WEBHOOK_SECRET,
    webhookSecretHeader: config?.webhookSecretHeader,
    statusCallbackUrl: config?.statusCallbackUrl ?? process.env.SENDBLUE_STATUS_CALLBACK_URL,
    allowedServices: config?.allowedServices,
    logger: config?.logger
  });
}
export {
  REACTION_ALIASES,
  SendblueAdapter,
  VALID_REACTIONS,
  createSendblueAdapter,
  toPlainText
};
//# sourceMappingURL=index.js.map