/*
 Copyright 2025 Google LLC

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

      https://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

import { SignalWatcher } from "@lit-labs/signals";
import { provide } from "@lit/context";
import {
  LitElement,
  html,
  css,
  nothing,
  HTMLTemplateResult,
  unsafeCSS,
  PropertyValues,
} from "lit";
import { customElement, state } from "lit/decorators.js";
import { theme as uiTheme } from "./theme/default-theme.js";
import { A2UIClient } from "./client.js";
import {
  SnackbarAction,
  SnackbarMessage,
  SnackbarUUID,
  SnackType,
} from "./types/types.js";
import { type Snackbar } from "./ui/snackbar.js";
// import { repeat } from "lit/directives/repeat.js";
import { v0_8 } from "@a2ui/lit";
import * as UI from "@a2ui/lit/ui";

// App elements.
import "./ui/ui.js";

// Configurations
import { AppConfig } from "./configs/types.js";
import { config as restaurantConfig } from "./configs/restaurant.js";
import { config as contactsConfig } from "./configs/contacts.js";
import { config as orchestratorConfig } from "./configs/orchestrator.js";
import { styleMap } from "lit/directives/style-map.js";
import { classMap } from "lit/directives/class-map.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { marked } from "marked";

const configs: Record<string, AppConfig> = {
  orchestrator: orchestratorConfig,
  restaurant: restaurantConfig,
  contacts: contactsConfig,
};

interface HistoryItem {
  role: "user" | "agent";
  text?: string;
  processor?: any;
  surfaces?: Map<string, any> | ReadonlyMap<string, any>;
  messages?: v0_8.Types.ServerToClientMessage[];
  allTextResponses?: string[];
  isUIResponse?: boolean;
  origin?: "chat" | "canvas";
  queryId?: string;
}

interface Canvas {
  canvasId: string;
  canvasVersion: number;
  serverUrl: string;
  uiMessages: v0_8.Types.ServerToClientMessage[];
}

interface Query {
  id: string;
  timestamp: number;
  processor: any;
  canvases: Canvas[];
  userText?: string;
  agentResponse?: HistoryItem;
}

interface Conversation {
  id: string;
  title: string;
  queries: Query[];
  client?: A2UIClient;
}

@customElement("a2ui-shell")
export class A2UILayoutEditor extends SignalWatcher(LitElement) {
  @provide({ context: UI.Context.themeContext })
  accessor theme: v0_8.Types.Theme = uiTheme;

  @state()
  accessor #requesting = false;

  @state()
  accessor #error: string | null = null;

  @state()
  accessor #lastMessages: v0_8.Types.ServerToClientMessage[] = [];

  @state()
  accessor #loadingTextIndex = 0;
  #loadingInterval: number | undefined;

  @state()
  accessor config: AppConfig = configs.restaurant;

  @state()
  accessor #conversations: Conversation[] = [];

  @state()
  accessor #activeConversationId: string | null = null;

  @state()
  accessor #activeQueryId: string | null = null;

  @state()
  accessor #isCanvasOpen = false;

  @state()
  accessor #isFocused = false;

  get #latestUIItem(): HistoryItem | null {
    const history = this.#activeHistory;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].isUIResponse && history[i].surfaces) {
        return history[i];
      }
    }
    return null;
  }

  get #activeHistory(): HistoryItem[] {
    if (!this.#activeConversationId) return [];
    const conversation = this.#conversations.find(
      (c) => c.id === this.#activeConversationId
    );
    if (!conversation) return [];

    const history: HistoryItem[] = [];
    for (const query of conversation.queries) {
      if (query.userText) {
        history.push({
          role: "user",
          text: query.userText,
          origin: "chat",
          queryId: query.id
        });
      }
      if (query.agentResponse) {
        const item = { ...query.agentResponse, queryId: query.id };
        if (!item.processor) item.processor = query.processor;
        history.push(item);
      }
    }
    return history;
  }

  static styles = [
    unsafeCSS(v0_8.Styles.structuralStyles),
    css`
      * {
        box-sizing: border-box;
      }

      :host {
        display: flex;
        flex-direction: row;
        width: 100vw;
        height: 100vh;
        color: light-dark(var(--n-10), var(--n-90));
        font-family: "Outfit", sans-serif;
        overflow: hidden;
        background: light-dark(var(--n-100), var(--n-0));
        color-scheme: var(--color-scheme, light dark);
        
        --sidebar-width: 300px;
        --sidebar-bg: light-dark(rgba(245, 247, 250, 0.8), rgba(15, 23, 42, 0.8));
        --sidebar-border: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.1));
        --chat-bg: transparent;
        --user-msg-bg: light-dark(#334155, #475569);
        --user-msg-text: #ffffff;
        --agent-msg-bg: light-dark(#f8fafc, #0f172a);
        --agent-msg-border: light-dark(rgba(0,0,0,0.05), rgba(255,255,255,0.05));
        --agent-msg-text: light-dark(var(--n-10), var(--n-90));
        --header-height: 64px;
        --accent-blue: #3b82f6;
        --accent-blue-hover: #2563eb;
        --card-bg: #f8fafc;
        --card-border: rgba(0,0,0,0.05);
      }

      .sidebar {
        width: var(--sidebar-width);
        background: var(--sidebar-bg);
        border-right: 1px solid var(--sidebar-border);
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        backdrop-filter: blur(20px);
        transition: transform 0.3s ease;
        z-index: 20;
      }

      .sidebar-header {
        padding: 32px 24px;
      }

      .new-chat-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 14px;
        background: var(--accent-blue);
        color: white;
        border: none;
        border-radius: 16px;
        cursor: pointer;
        font-weight: 600;
        font-size: 15px;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
      }
      
      .new-chat-btn:hover {
        background: var(--accent-blue-hover);
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(59, 130, 246, 0.35);
      }

      .new-chat-btn:active {
        transform: scale(0.98);
      }

      .conversation-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        scrollbar-width: none;
      }

      .conversation-list::-webkit-scrollbar {
        display: none;
      }

      .conversation-item {
        padding: 14px 16px;
        border-radius: 12px;
        cursor: pointer;
        color: light-dark(var(--n-40), var(--n-70));
        transition: all 0.2s ease;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 14px;
        border: 1px solid transparent;
      }

      .conversation-item:hover {
        background: light-dark(rgba(0, 0, 0, 0.03), rgba(255, 255, 255, 0.03));
        color: light-dark(var(--n-10), var(--n-90));
      }

      .conversation-item.active {
        background: light-dark(rgba(59, 130, 246, 0.08), rgba(59, 130, 246, 0.15));
        color: var(--accent-blue);
        font-weight: 600;
        border-color: light-dark(rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.2));
      }

      .main-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        height: 100%;
        position: relative;
        overflow: hidden;
        background: var(--chat-bg);
        transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .main-container.focused {
        max-width: 0;
        opacity: 0;
        pointer-events: none;
        padding: 0;
      }

      .canvas-panel {
        width: 0;
        height: 100%;
        background: light-dark(#ffffff, #0f172a);
        border-left: 1px solid var(--sidebar-border);
        display: flex;
        flex-direction: column;
        transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        overflow: hidden;
        opacity: 0;
      }

      .canvas-panel.open {
        width: 60%;
        opacity: 1;
      }

      .canvas-panel.focused {
        width: 100%;
      }

      .canvas-header {
        height: var(--header-height);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 24px;
        border-bottom: 1px solid var(--sidebar-border);
      }

      .canvas-content {
        flex: 1;
        overflow-y: auto;
        padding: 40px;
        display: flex;
        justify-content: center;
      }

      .canvas-surface-wrapper {
        width: 100%;
        max-width: 800px;
        background: light-dark(#f8fafc, #1e293b);
        border-radius: 24px;
        padding: 32px;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
        height: fit-content;
      }

      .ui-artifact-btn {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 20px;
        background: light-dark(rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.2));
        border: 1px solid light-dark(rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.4));
        border-radius: 12px;
        color: var(--accent-blue);
        cursor: pointer;
        font-weight: 600;
        margin-top: 12px;
        transition: all 0.2s ease;
        width: fit-content;
      }

      .ui-artifact-btn:hover {
        background: light-dark(rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.25));
        transform: translateY(-1px);
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .focus-mode-btn {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        border: none;
        background: transparent;
        color: light-dark(var(--n-40), var(--n-70));
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
      }

      .focus-mode-btn:hover {
        background: light-dark(rgba(0,0,0,0.05), rgba(255,255,255,0.1));
        color: var(--accent-blue);
      }

      .close-canvas-btn {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        border: none;
        background: transparent;
        color: light-dark(var(--n-40), var(--n-70));
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .close-canvas-btn:hover {
        background: light-dark(rgba(0,0,0,0.05), rgba(255,255,255,0.1));
        color: #ef4444;
      }

      .header {
        height: var(--header-height);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 32px;
        border-bottom: 1px solid var(--sidebar-border);
        background: light-dark(rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0.05));
        backdrop-filter: blur(10px);
        z-index: 15;
      }

      .header-title {
        font-size: 18px;
        font-weight: 700;
        color: light-dark(var(--n-20), var(--n-80));
        letter-spacing: -0.02em;
      }

      .content-area {
        flex: 1;
        overflow-y: auto;
        padding: 40px 64px;
        display: flex;
        flex-direction: column;
        gap: 40px;
        width: 100%;
        max-width: 100%;
        margin: 0;
        scroll-behavior: smooth;
        scrollbar-width: none;
      }

      .content-area::-webkit-scrollbar {
        display: none;
      }

      .input-area {
        padding: 24px 64px 48px;
        background: transparent;
        width: 100%;
        max-width: 1200px;
        margin: 0 auto;
        position: relative;
        z-index: 10;
      }

      #hero-img {
        width: 100%;
        max-width: 320px;
        aspect-ratio: 1;
        height: auto;
        margin-bottom: 32px;
        display: block;
        margin: 40px auto;
        background: var(--background-image-light) center center / contain
          no-repeat;
      }

      form {
        display: flex;
        flex-direction: column;
        gap: 16px;
        align-items: center;
        width: 100%;
        animation: fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1);

        & > div {
          display: flex;
          flex: 1;
          gap: 12px;
          align-items: center;
          width: 100%;
          background: light-dark(white, var(--n-10));
          padding: 10px 10px 10px 24px;
          border-radius: 24px;
          border: 1px solid var(--sidebar-border);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);

          &:focus-within {
             border-color: var(--accent-blue);
             box-shadow: 0 15px 35px -5px rgba(59, 130, 246, 0.2);
             transform: translateY(-2px);
          }

          & > input {
            display: block;
            flex: 1;
            border: none;
            background: transparent;
            padding: 12px 0;
            font-size: 16px;
            color: light-dark(var(--n-10), var(--n-90));
            outline: none;
            font-family: inherit;

            &::placeholder {
              color: light-dark(var(--n-60), var(--n-40));
            }
          }

          & > button {
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--accent-blue);
            color: white;
            border: none;
            width: 44px;
            height: 44px;
            border-radius: 18px;
            cursor: pointer;
            transition: all 0.2s ease;

            &:disabled {
              opacity: 0.3;
              cursor: not-allowed;
              filter: grayscale(1);
            }
            
            &:not(:disabled):hover {
               background: var(--accent-blue-hover);
               transform: scale(1.05);
            }

            &:not(:disabled):active {
               transform: scale(0.95);
            }
          }
        }
      }

      .pending {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 100;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.5s ease;
        gap: 16px;
        color: light-dark(var(--n-40), var(--n-60));
        font-size: 14px;
        background: light-dark(rgba(255, 255, 255, 0.8), rgba(15, 23, 42, 0.8));
        padding: 24px;
        border-radius: 16px;
        backdrop-filter: blur(4px);
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
      }

      .message-wrapper {
        display: flex;
        flex-direction: column;
        width: 100%;
      }

      .user-message {
        background: var(--user-msg-bg);
        color: var(--user-msg-text);
        padding: 16px 24px;
        border-radius: 20px 20px 4px 20px;
        max-width: 80%;
        min-width: 50%;
        word-break: break-word;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
        line-height: 1.6;
        font-size: 20px;
        animation: slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      .user-message-container {
        display: flex;
        align-items: flex-end;
        gap: 12px;
        width: 100%;
        justify-content: flex-end;
        margin-bottom: 8px;
      }

      .user-avatar {
        width: 36px;
        height: 36px;
        border-radius: 12px;
        background: var(--accent-blue);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        flex-shrink: 0;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
      }

      .agent-message {
        align-self: flex-start;
        background: var(--agent-msg-bg);
        color: var(--agent-msg-text);
        padding: 16px 24px;
        border-radius: 20px 20px 20px 4px;
        width: 100%;
        max-width: calc(100% - 450px);
        word-break: break-word;
        line-height: 1.6;
        font-size: 20px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
        border: 1px solid var(--agent-msg-border);
        animation: slideInLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .agent-message.has-surface {
        background: transparent;
        padding: 0;
        box-shadow: none;
        max-width: calc(100% - 100px);
      }
      
      .agent-message a2ui-surface {
         display: block;
         margin-top: 12px;
         width: 100%;
      }

      .spinner {
        width: 24px;
        height: 24px;
        border: 3px solid light-dark(rgba(0,0,0,0.1), rgba(255,255,255,0.1));
        border-left-color: var(--accent-blue);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      .theme-toggle {
        padding: 0;
        margin: 0;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border-radius: 12px;
        color: light-dark(var(--n-40), var(--n-70));
        cursor: pointer;
        width: 40px;
        height: 40px;
        font-size: 24px;
        transition: all 0.2s ease;

        &:hover {
          background: light-dark(rgba(0,0,0,0.05), rgba(255,255,255,0.1));
          color: var(--accent-blue);
        }

        & .g-icon {
          pointer-events: none;

          &::before {
            content: "dark_mode";
          }
        }
      }

      @container style(--color-scheme: dark) {
        .theme-toggle .g-icon::before {
          content: "light_mode";
          color: var(--n-90);
        }

        #hero-img {
          background-image: var(--background-image-dark);
        }
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      @keyframes slideInRight {
        from { opacity: 0; transform: translateX(20px); }
        to { opacity: 1; transform: translateX(0); }
      }

      @keyframes slideInLeft {
        from { opacity: 0; transform: translateX(-20px); }
        to { opacity: 1; transform: translateX(0); }
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .error {
        color: var(--e-40);
        background-color: var(--e-95);
        border: 1px solid var(--e-80);
        padding: 16px;
        border-radius: 12px;
        margin: 0 24px;
        font-size: 14px;
      }
    `,
  ];

  #a2uiClient = new A2UIClient();
  #snackbar: Snackbar | undefined = undefined;
  #pendingSnackbarMessages: Array<{
    message: SnackbarMessage;
    replaceAll: boolean;
  }> = [];

  #maybeRenderError() {
    if (!this.#error) return nothing;
    return html`<div class="error">${this.#error}</div>`;
  }

  #setTheme(theme: "dark" | "light") {
    const body = document.body;
    const root = document.documentElement;

    if (theme === "dark") {
      body.classList.remove("light");
      body.classList.add("dark");
      root.style.colorScheme = "dark";
      root.style.setProperty("--card-bg", "#1e293b", "important");
      root.style.setProperty("--card-border", "rgba(255,255,255,0.05)", "important");
      root.style.setProperty("--n-0", "#1e293b", "important");
      root.style.setProperty("--n-100", "#f8fafc", "important");
      root.style.setProperty("--n-90", "#e2e8f0", "important");
      root.style.setProperty("--n-70", "#cbd5e1", "important");
      root.style.setProperty("--p-70", "#94a3b8", "important");
    } else {
      body.classList.remove("dark");
      body.classList.add("light");
      root.style.colorScheme = "light";
      root.style.setProperty("--card-bg", "#f8fafc");
      root.style.setProperty("--card-border", "rgba(0,0,0,0.05)");
      root.style.removeProperty("--n-90");
      root.style.removeProperty("--n-70");
      root.style.removeProperty("--p-70");
    }
  }

  #saveState() {
    const stateToSave = {
      conversations: this.#conversations.map((c) => ({
        ...c,
        queries: c.queries.map((q) => {
          const { processor, ...rest } = q;
          const agentResponse = q.agentResponse ? { ...q.agentResponse } : undefined;
          if (agentResponse) {
            delete agentResponse.processor;
            delete agentResponse.surfaces;
          }
          return { ...rest, agentResponse };
        }),
      })),
      activeConversationId: this.#activeConversationId,
      isCanvasOpen: this.#isCanvasOpen,
      isFocused: this.#isFocused,
    };
    localStorage.setItem("a2ui_shell_state", JSON.stringify(stateToSave));
  }

  #loadState() {
    const stored = localStorage.getItem("a2ui_shell_state");
    if (!stored) return;

    try {
      const state = JSON.parse(stored);
      if (state.conversations) {
        this.#conversations = (state.conversations as any[]).map((c) => {
          const queries = (c.queries || []).map((q: any) => {
            const processor = v0_8.Data.createSignalA2uiMessageProcessor();

            if (q.canvases) {
              for (const canvas of q.canvases) {
                if (canvas.uiMessages) {
                  processor.processMessages(canvas.uiMessages);
                }
              }
            }

            const surfaces = processor.getSurfaces();
            let agentResponse = q.agentResponse;
            if (agentResponse) {
              agentResponse = {
                ...agentResponse,
                processor,
                surfaces
              };
            }

            return {
              ...q,
              processor,
              agentResponse
            };
          });

          return {
            ...c,
            queries,
            client: new A2UIClient(this.config?.serverUrl || "http://localhost:10005")
          };
        });
      }
      if (state.activeConversationId) {
        this.#activeConversationId = state.activeConversationId;
      }
      if (state.isCanvasOpen !== undefined) {
        this.#isCanvasOpen = state.isCanvasOpen;
      }
      if (state.isFocused !== undefined) {
        this.#isFocused = state.isFocused;
      }
    } catch (e) {
      console.error("Failed to load state", e);
    }
  }

  connectedCallback() {
    super.connectedCallback();
    const urlParams = new URLSearchParams(window.location.search);
    const appKey = urlParams.get("app") || "orchestrator";
    this.config = configs[appKey] || configs.orchestrator;

    if (this.config.theme) {
      this.theme = this.config.theme;
    }

    this.#loadState();
    this.#setTheme("dark");

    window.document.title = this.config.title;
    window.document.documentElement.style.setProperty(
      "--background",
      this.config.background
    );

    this.#a2uiClient = new A2UIClient(this.config.serverUrl);
  }

  updated(changedProperties: PropertyValues<this>) {
    super.updated(changedProperties);

    let shouldScroll = false;
    let shouldSave = false;

    let oldConversations: Conversation[] | undefined;
    let conversationsChanged = false;

    changedProperties.forEach((oldValue, key) => {
      const keyStr = String(key);

      if (keyStr.includes("activeConversationId")) {
        shouldScroll = true;
      }

      if (keyStr.includes("conversations")) {
        conversationsChanged = true;
        oldConversations = oldValue as Conversation[];
      }

      if (
        !keyStr.includes("loadingTextIndex") &&
        !keyStr.includes("requesting")
      ) {
        shouldSave = true;
      }
    });

    if (!shouldScroll && conversationsChanged) {
       if (this.#activeConversationId) {
          const newConv = this.#conversations.find(c => c.id === this.#activeConversationId);
          const oldConv = oldConversations?.find(c => c.id === this.#activeConversationId);

          if (newConv) {
             if (!oldConv || newConv.queries.length > oldConv.queries.length) {
                shouldScroll = true;
             }
          }
       }
    }

    if (shouldScroll) {
      this.#scrollToBottom();
    }

    if (shouldSave) {
      this.#saveState();
    }
  }

  #scrollToBottom() {
    const contentArea = this.shadowRoot?.querySelector(".content-area");
    if (contentArea) {
      setTimeout(() => {
        contentArea.scrollTop = contentArea.scrollHeight;
      }, 0);
    }
  }

  render() {
    const activeConv = this.#conversations.find(c => c.id === this.#activeConversationId);
    const title = activeConv?.title || this.config.title;

    return html`
      <div class="sidebar">
        <div class="sidebar-header">
          <button class="new-chat-btn" @click=${this.#createNewChat}>
            <span class="g-icon">add</span> New Chat
          </button>
        </div>
        <div class="conversation-list">
          ${this.#conversations.map(
      (conv) => html`
              <div
                class=${classMap({
        "conversation-item": true,
        active: conv.id === this.#activeConversationId,
      })}
                @click=${() => this.#selectConversation(conv.id)}
              >
                <span class="conversation-title">${conv.title || "New Chat"}</span>
              </div>
            `
    )}
        </div>
      </div>
      <div class="main-container ${this.#isFocused ? 'focused' : ''}">
        <header class="header">
          <div class="header-title">${title}</div>
          <div class="header-actions">
            ${this.#renderFocusModeButton()}
            ${this.#renderThemeToggle()}
          </div>
        </header>
        <div class="content-area">
          ${!this.#activeConversationId || this.#activeHistory.length === 0
        ? this.#renderWelcome()
        : nothing}
          ${this.#renderHistory()} 
          ${this.#maybeRenderError()}
        </div>
        ${this.#maybeRenderData()}
        <div class="input-area">${this.#renderInputForm()}</div>
      </div>
      <div class="canvas-panel ${this.#isCanvasOpen ? 'open' : ''} ${this.#isFocused ? 'focused' : ''}">
        ${this.#renderCanvas()}
      </div>
    `;
  }

  #renderFocusModeButton() {
    if (!this.#isCanvasOpen || !this.#latestUIItem) return nothing;
    return html`
      <button class="focus-mode-btn" @click=${() => this.#isFocused = !this.#isFocused} title="Toggle Focus Mode">
        <span class="g-icon">${this.#isFocused ? 'fullscreen_exit' : 'fullscreen'}</span>
      </button>
    `;
  }

  #renderCanvas() {
    const activeConv = this.#conversations.find(c => c.id === this.#activeConversationId);
    if (!activeConv) return nothing;

    // Find active query
    let activeQuery = activeConv.queries.find(q => q.id === this.#activeQueryId);
    // If no active query selected, default to the last one that has canvases
    if (!activeQuery) {
      for (let i = activeConv.queries.length - 1; i >= 0; i--) {
        if (activeConv.queries[i].canvases.length > 0) {
          activeQuery = activeConv.queries[i];
          break;
        }
      }
    }

    if (!activeQuery || activeQuery.canvases.length === 0) return nothing;

    const activeCanvas = activeQuery.canvases[activeQuery.canvases.length - 1];
    const processor = activeQuery.processor;
    const surfaces = processor.getSurfaces();
    const surfaceMap = Array.from(surfaces as Map<string, any>);

    let latestSurfaceId, latestSurface;
    if (surfaceMap.length > 0) {
      [latestSurfaceId, latestSurface] = surfaceMap[surfaceMap.length - 1];
    }

    return html`
      <div id="canvas-container-${activeCanvas.canvasId}-${activeCanvas.canvasVersion}" class="canvas-wrapper-inner" style="height: 100%; display: flex; flex-direction: column;">
        <div class="canvas-header">
          <div class="header-title" style="font-size: 16px;">Live Preview</div>
          <button class="close-canvas-btn" @click=${() => { this.#isCanvasOpen = false; this.#isFocused = false; }}>
            <span class="g-icon">close</span>
          </button>
        </div>
        <div class="canvas-content">
          ${latestSurfaceId && latestSurface
      ? html`
              <div class="canvas-surface-wrapper" data-conv-id="${activeConv.id}">
                <a2ui-surface
                  @a2uiaction=${(evt: v0_8.Events.StateEvent<"a2ui.action">) => this.#handleSurfaceAction(evt, { processor } as any, latestSurfaceId!, true)}
                  .surfaceId=${latestSurfaceId}
                  .surface=${latestSurface}
                  .processor=${processor}
                ></a2ui-surface>
              </div>`
      : html`
              <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: var(--n-60); height: 100%;">
                No UI updates found in this conversation
              </div>`
    }
        </div>
      </div>
    `;
  }



  async #handleSurfaceAction(evt: v0_8.Events.StateEvent<"a2ui.action">, item: HistoryItem, surfaceId: string, fromCanvas = false) {
    const activeConv = this.#conversations.find(c => c.id === this.#activeConversationId);
    let processor = item.processor;

    if (!processor && activeConv) {
       // Try to find processor from active query if fromCanvas
       if (fromCanvas) {
          let activeQuery = activeConv.queries.find(q => q.id === this.#activeQueryId);
          if (!activeQuery) {
             // Default to last query with canvases
             for (let i = activeConv.queries.length - 1; i >= 0; i--) {
                if (activeConv.queries[i].canvases.length > 0) {
                   activeQuery = activeConv.queries[i];
                   break;
                }
             }
          }
          if (activeQuery) processor = activeQuery.processor;
       }
    }

    if (!processor) return;

    const [target] = evt.composedPath();
    if (!(target instanceof HTMLElement)) return;

    const context: v0_8.Types.A2UIClientEventMessage["userAction"]["context"] = {};
    if (evt.detail.action.context) {
      const srcContext = evt.detail.action.context;
      for (const ctxItem of srcContext) {
        if (ctxItem.value.literalBoolean !== undefined) {
          context[ctxItem.key] = ctxItem.value.literalBoolean;
        } else if (ctxItem.value.literalNumber !== undefined) {
          context[ctxItem.key] = ctxItem.value.literalNumber;
        } else if (ctxItem.value.literalString !== undefined) {
          context[ctxItem.key] = ctxItem.value.literalString;
        } else if (ctxItem.value.path) {
          const path = processor.resolvePath(ctxItem.value.path, evt.detail.dataContextPath);
          context[ctxItem.key] = processor.getData(evt.detail.sourceComponent, path, surfaceId);
        }
      }
    }

    const message: v0_8.Types.A2UIClientEventMessage = {
      userAction: {
        name: evt.detail.action.name,
        surfaceId,
        sourceComponentId: target.id,
        timestamp: new Date().toISOString(),
        context,
      },
    };

    await this.#sendAndProcessMessage(message, fromCanvas);
  }

  #createNewChat() {
    const id = globalThis.crypto.randomUUID();
    const newConv: Conversation = {
      id,
      title: "",
      queries: [],
      client: new A2UIClient(this.config.serverUrl)
    };
    this.#conversations = [newConv, ...this.#conversations];
    this.#activeConversationId = newConv.id;
  }

  #selectConversation(id: string) {
    this.#activeConversationId = id;
    // Reset active query when switching conversation? Or keep it null to show latest?
    this.#activeQueryId = null;
  }

  #renderThemeToggle() {
    return html`
      <button
        @click=${() => {
        const isDark = document.body.classList.contains("dark");
        this.#setTheme(isDark ? "light" : "dark");
      }}
        class="theme-toggle"
        title="Toggle Theme"
      >
        <span class="g-icon filled-heavy"></span>
      </button>`;
  }

  #renderWelcome() {
    return html`
      <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0.8;">
        ${this.config.heroImage
        ? html`<div
              style=${styleMap({
          "--background-image-light": `url(${this.config.heroImage})`,
          "--background-image-dark": `url(${this.config.heroImageDark ?? this.config.heroImage})`,
        })}
              id="hero-img"
            ></div>`
        : nothing}
        <h1 class="app-title" style="text-align: center; margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.03em;">
          How can I help you today?
        </h1>
        <p style="text-align: center; color: light-dark(var(--n-40), var(--n-60)); margin-top: 12px; font-size: 16px;">
          Try asking for restaurants, contacts or something else.
        </p>
      </div>
    `;
  }

  #renderHistory() {
    return html`
      ${this.#activeHistory.map((item) => {
      if (item.origin === "canvas" && item.isUIResponse) {
        return nothing;
      }
      const hasSurface = !!(item.surfaces);

      if (item.role === "user") {
        return html`
            <div class="message-wrapper">
              <div class="user-message-container">
                <div class="user-message">${item.text}</div>
                <div class="user-avatar">
                  <span class="g-icon">person</span>
                </div>
              </div>
            </div>`;
      }

      return html`
          <div class="message-wrapper">
            <div class=${classMap({ "agent-message": true, "has-surface": hasSurface })}>
                ${this.#renderAgentContent(item, item.processor)}
            </div>
          </div>`;
    })}
    `;
  }

  #renderAgentContent(item: HistoryItem, processor?: any) {
    if (item.isUIResponse && item.surfaces) {
      const isFromCanvas = item.origin === "canvas";

      return html`
        <div class="agent-text" style="${isFromCanvas ? 'font-size: 16px; opacity: 0.8; font-style: italic;' : ''}">
          ${item.text || (isFromCanvas ? 'Canvas updated' : 'I have generated a UI for you.')}
        </div>
        <button class="ui-artifact-btn" @click=${() => {
          this.#isCanvasOpen = true;
          if (item.queryId) {
            this.#activeQueryId = item.queryId;
          }
        }}>
          <span class="g-icon">web_asset</span>
          Open in Canvas
        </button>
      `;
    }

    if (item.surfaces && processor) {
      const surfaces = Array.from(item.surfaces as Map<string, any>);
      if (surfaces.length > 0) {
        const [surfaceId, surface] = surfaces[surfaces.length - 1];
        return html`<a2ui-surface
                @a2uiaction=${(evt: v0_8.Events.StateEvent<"a2ui.action">) => this.#handleSurfaceAction(evt, item, surfaceId, false)}
                .surfaceId=${surfaceId}
                .surface=${surface}
                .processor=${processor}
              ></a2ui-surface>`;
      }
    }


    if (item.text) {
      return html`<div>${unsafeHTML(marked.parse(item.text))}</div>`;
    }

    return nothing;
  }

  #renderInputForm() {
    return html` <form
      @submit=${async (evt: Event) => {
        evt.preventDefault();
        if (!(evt.target instanceof HTMLFormElement)) {
          return;
        }
        const data = new FormData(evt.target);
        const body = data.get("body") ?? null;
        if (!body) {
          return;
        }

        evt.target.reset();
        await this.#sendAndProcessMessage(body as string, false);
      }}
    >
      <div>
        <input
          required
          placeholder="${this.config.placeholder}"
          autocomplete="off"
          id="body"
          name="body"
          type="text"
          ?disabled=${this.#requesting}
        />
        <button type="submit" ?disabled=${this.#requesting}>
          <span class="g-icon filled-heavy">send</span>
        </button>
      </div>
    </form>`;
  }

  #startLoadingAnimation() {
    if (
      Array.isArray(this.config.loadingText) &&
      this.config.loadingText.length > 1
    ) {
      this.#loadingTextIndex = 0;
      this.#loadingInterval = window.setInterval(() => {
        this.#loadingTextIndex =
          (this.#loadingTextIndex + 1) %
          (this.config.loadingText as string[]).length;
      }, 2000);
    }
  }

  #stopLoadingAnimation() {
    if (this.#loadingInterval) {
      clearInterval(this.#loadingInterval);
      this.#loadingInterval = undefined;
    }
  }

  async #sendMessage(
    request: v0_8.Types.A2UIClientEventMessage | string,
    clientInstance?: A2UIClient
  ): Promise<{ messages: v0_8.Types.ServerToClientMessage[], ui_response: boolean }> {
    try {
      this.#requesting = true;
      this.#startLoadingAnimation();
      const client = clientInstance || this.#a2uiClient;
      if (!client) throw new Error("Client not initialized");
      const response = await client.send(request);
      return response;
    } catch (err) {
      this.snackbar(err as string, SnackType.ERROR);
      return { messages: [], ui_response: false };
    } finally {
      this.#requesting = false;
      this.#stopLoadingAnimation();
    }
  }

  #maybeRenderData() {
    if (this.#requesting) {
      let text = "Awaiting an answer...";
      if (this.config.loadingText) {
        if (Array.isArray(this.config.loadingText)) {
          text = this.config.loadingText[this.#loadingTextIndex];
        } else {
          text = this.config.loadingText;
        }
      }

      return html` <div class="pending">
        <div class="spinner"></div>
        <div class="loading-text">${text}</div>
      </div>`;
    }
    return nothing;
  }

  async #sendAndProcessMessage(request: any, fromCanvas = false) {
    if (!this.#activeConversationId) {
      this.#createNewChat();
    }

    const conversationId = this.#activeConversationId!;
    let conversation = this.#conversations.find((c) => c.id === conversationId)!;

    let currentQuery: Query;

    if (typeof request === "string") {
      const queryId = globalThis.crypto.randomUUID();
      currentQuery = {
        id: queryId,
        timestamp: Date.now(),
        processor: v0_8.Data.createSignalA2uiMessageProcessor(),
        canvases: [],
        userText: request
      };

      const updatedQueries = [...conversation.queries, currentQuery];
      let updatedTitle = conversation.title;
      if (conversation.queries.length === 0) {
        updatedTitle = request;
      }

      this.#conversations = this.#conversations.map(c =>
        c.id === conversationId ? { ...c, queries: updatedQueries, title: updatedTitle } : c
      );

      // Update local reference
      conversation = this.#conversations.find((c) => c.id === conversationId)!;
    } else {
      // It's a UI event
      const queries = conversation.queries;
      if (queries.length === 0) return;

      // If fromCanvas, try to find the query associated with the active canvas
      if (fromCanvas && this.#activeQueryId) {
         currentQuery = queries.find(q => q.id === this.#activeQueryId) || queries[queries.length - 1];
      } else {
         currentQuery = queries[queries.length - 1];
      }
    }

    const { messages, ui_response } = await this.#sendMessage(request, conversation.client);

    // Re-fetch to get latest state
    const processingConv = this.#conversations.find((c) => c.id === conversationId);
    if (!processingConv) return;

    const queryIndex = processingConv.queries.findIndex(q => q.id === currentQuery.id);
    if (queryIndex === -1) return;

    const query = processingConv.queries[queryIndex];
    const processor = query.processor;

    processor.processMessages(messages);

    let canvases = [...query.canvases];

    if (canvases.length > 0) {
      const activeCanvas = { ...canvases[canvases.length - 1] };
      activeCanvas.uiMessages = [...activeCanvas.uiMessages, ...messages];
      if (ui_response) {
        activeCanvas.canvasVersion = activeCanvas.canvasVersion + 1;
      }
      canvases[canvases.length - 1] = activeCanvas;
    } else if (ui_response) {
      canvases.push({
        canvasId: globalThis.crypto.randomUUID(),
        canvasVersion: 0,
        serverUrl: this.config.serverUrl || "",
        uiMessages: [...messages]
      });
    }

    const surfaces = processor.getSurfaces();

    const textResponses: string[] = [];
    let uiTitle: string | undefined = undefined;

    for (const msg of messages) {
      if (msg.dataModelUpdate?.contents) {
        for (const content of msg.dataModelUpdate.contents) {
          if (content.key === "title" && content.valueString) {
            uiTitle = content.valueString;
          } else if (content.key === "response" && content.valueString) {
            textResponses.push(content.valueString);
          }
        }
      }
    }

    let agentResponse = query.agentResponse;

    if (!agentResponse || !fromCanvas) {
      agentResponse = {
        role: "agent",
        messages,
        isUIResponse: ui_response,
        text: uiTitle || (textResponses.length > 0 ? textResponses[textResponses.length - 1] : undefined),
        allTextResponses: textResponses.length > 0 ? textResponses : undefined,
        origin: fromCanvas ? "canvas" : "chat",
        processor,
        surfaces,
        queryId: query.id
      };
    } else {
      // Update existing response with latest state but preserve identity
      agentResponse = {
        ...agentResponse,
        processor,
        surfaces,
        // If we got a new UI response (e.g. navigation), we might want to ensure isUIResponse is true
        isUIResponse: agentResponse.isUIResponse || ui_response
      };
    }

    const updatedQuery = {
      ...query,
      canvases,
      agentResponse
    };

    if (ui_response && typeof request === "string") {
      this.#activeQueryId = query.id;
    }

    const updatedQueries = [...processingConv.queries];
    updatedQueries[queryIndex] = updatedQuery;

    this.#conversations = this.#conversations.map(c =>
      c.id === conversationId ? { ...c, queries: updatedQueries } : c
    );

    this.#lastMessages = messages;
  }

  snackbar(
    message: string | HTMLTemplateResult,
    type: SnackType,
    actions: SnackbarAction[] = [],
    persistent = false,
    id = globalThis.crypto.randomUUID(),
    replaceAll = false
  ) {
    if (!this.#snackbar) {
      this.#pendingSnackbarMessages.push({
        message: { id, message, type, persistent, actions },
        replaceAll,
      });
      return;
    }

    return this.#snackbar.show({ id, message, type, persistent, actions }, replaceAll);
  }

  unsnackbar(id?: SnackbarUUID) {
    if (!this.#snackbar) return;
    this.#snackbar.hide(id);
  }
}
