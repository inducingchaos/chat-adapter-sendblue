import type SendblueAPI from "sendblue";
export interface SendblueAdapterConfig {
    apiKey: string;
    apiSecret: string;
    defaultFromNumber: string;
    webhookSecret?: string;
    /**
     * Header name Sendblue uses to deliver the webhook secret.
     * @default "sb-signing-secret"
     */
    webhookSecretHeader?: string;
    statusCallbackUrl?: string;
    /**
     * Which messaging services to accept from inbound webhooks.
     * @default ["iMessage"]
     */
    allowedServices?: SendblueService[];
}
export type SendblueService = "iMessage" | "SMS" | "RCS" | "sms";
export interface SendblueThreadId {
    fromNumber: string;
    contactNumber?: string;
    groupId?: string;
}
export interface SendblueMessagePayload {
    accountEmail?: string;
    content: string;
    is_outbound: boolean;
    status: string;
    error_code: number | null;
    error_message: string | null;
    error_reason: string | null;
    error_detail: string | null;
    message_handle: string;
    date_sent: string;
    date_updated: string;
    from_number: string;
    number: string;
    to_number: string;
    was_downgraded: boolean | null;
    plan?: string;
    media_url: string;
    message_type: "message" | "group" | string;
    group_id: string;
    participants: string[];
    send_style: string;
    opted_out: boolean;
    sendblue_number: string | null;
    service: string;
    group_display_name: string | null;
}
export interface SendblueTypingPayload {
    number: string;
    is_typing: boolean;
    from_number: string;
    timestamp: string;
}
export type SendblueReaction = "love" | "like" | "dislike" | "laugh" | "emphasize" | "question";
export declare const VALID_REACTIONS: ReadonlySet<string>;
export declare const REACTION_ALIASES: Record<string, SendblueReaction>;
export type { SendblueAPI };
export type MessageResponse = SendblueAPI.MessageResponse;
export type MessageListResponse = SendblueAPI.MessageListResponse;
export type MessageSendParams = SendblueAPI.MessageSendParams;
//# sourceMappingURL=types.d.ts.map