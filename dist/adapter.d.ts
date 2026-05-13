import type { Adapter, AdapterPostableMessage, ChatInstance, EmojiValue, FetchOptions, FetchResult, FormattedContent, Logger, RawMessage, StreamChunk, StreamOptions, ThreadInfo, WebhookOptions } from "chat";
import { Message } from "chat";
import SendblueAPI from "sendblue";
import type { SendblueAdapterConfig, SendblueMessagePayload, SendblueThreadId } from "./types";
export declare class SendblueAdapter implements Adapter<SendblueThreadId, SendblueMessagePayload> {
    readonly name = "sendblue";
    readonly persistMessageHistory = true;
    readonly userName: string;
    private chat;
    private logger;
    private config;
    private sdk;
    constructor(config: SendblueAdapterConfig & {
        logger?: Logger;
    });
    initialize(chat: ChatInstance): Promise<void>;
    disconnect(): Promise<void>;
    encodeThreadId(data: SendblueThreadId): string;
    decodeThreadId(threadId: string): SendblueThreadId;
    handleWebhook(request: Request, options?: WebhookOptions): Promise<Response>;
    private processInboundMessage;
    private handleTypingWebhook;
    parseMessage(raw: SendblueMessagePayload): Message<SendblueMessagePayload>;
    postMessage(threadId: string, message: AdapterPostableMessage): Promise<RawMessage<SendblueMessagePayload>>;
    sendMediaMessage(threadId: string, mediaUrl: string, content?: string): Promise<void>;
    stream(threadId: string, textStream: AsyncIterable<string | StreamChunk>, _options?: StreamOptions): Promise<RawMessage<SendblueMessagePayload>>;
    editMessage(_threadId: string, _messageId: string, _message: AdapterPostableMessage): Promise<RawMessage<SendblueMessagePayload>>;
    deleteMessage(_threadId: string, _messageId: string): Promise<void>;
    addReaction(threadId: string, messageId: string, emoji: EmojiValue | string): Promise<void>;
    removeReaction(_threadId: string, _messageId: string, _emoji: EmojiValue | string): Promise<void>;
    fetchMessages(threadId: string, options?: FetchOptions): Promise<FetchResult<SendblueMessagePayload>>;
    fetchThread(threadId: string): Promise<ThreadInfo>;
    startTyping(threadId: string): Promise<void>;
    markRead(threadId: string): Promise<void>;
    evaluateService(number: string): Promise<{
        number?: string;
        service?: "iMessage" | "SMS";
    }>;
    listLines(): Promise<unknown>;
    /** Direct access to the official Sendblue SDK client */
    getSdk(): SendblueAPI;
    channelIdFromThreadId(threadId: string): string;
    renderFormatted(content: FormattedContent): string;
    private renderOutbound;
    private threadIdFromPayload;
    private isServiceAllowed;
    private resolveReaction;
    private buildAttachment;
}
//# sourceMappingURL=adapter.d.ts.map