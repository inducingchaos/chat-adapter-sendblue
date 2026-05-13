import type { Logger } from "chat";
import { SendblueAdapter } from "./adapter";
import type { SendblueAdapterConfig } from "./types";
export { SendblueAdapter } from "./adapter";
export { toPlainText } from "./format-converter";
export type { SendblueAdapterConfig, SendblueMessagePayload, SendblueReaction, SendblueService, SendblueThreadId, SendblueTypingPayload, } from "./types";
export { REACTION_ALIASES, VALID_REACTIONS } from "./types";
export declare function createSendblueAdapter(config?: Partial<SendblueAdapterConfig> & {
    logger?: Logger;
}): SendblueAdapter;
//# sourceMappingURL=index.d.ts.map