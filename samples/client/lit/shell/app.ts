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
}

interface Conversation {
  id: string;
  title: string;
  history: HistoryItem[];
  timestamp: number;
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
  accessor config: AppConfig = configs.restaurant;

  @state()
  accessor #loadingTextIndex = 0;
  #loadingInterval: number | undefined;

  @state()
  accessor #conversations: Conversation[] = [];

  @state()
  accessor #activeConversationId: string | null = null;

  get #activeHistory(): HistoryItem[] {
    if (!this.#activeConversationId) return [];
    const conversation = this.#conversations.find(
      (c) => c.id === this.#activeConversationId
    );
    return conversation ? conversation.history : [];
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
        font-family: var(--font-family);
        overflow: hidden;
        background: light-dark(var(--n-0), var(--n-100));
      }

      .sidebar {
        width: 260px;
        background: light-dark(var(--n-5), var(--n-95));
        border-right: 1px solid var(--n-80);
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
      }

      .sidebar-header {
        padding: 16px;
      }

      .new-chat-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px;
        background: var(--p-40);
        color: var(--n-100);
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 500;
      }
      
      .new-chat-btn:hover {
        opacity: 0.9;
      }

      .conversation-list {
        flex: 1;
        overflow-y: auto;
        padding: 0 8px;
      }

      .conversation-item {
        padding: 12px;
        margin-bottom: 4px;
        border-radius: 8px;
        cursor: pointer;
        color: light-dark(var(--n-30), var(--n-80));
        transition: background 0.2s;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .conversation-item:hover {
        background: light-dark(var(--n-10), var(--n-90));
      }

      .conversation-item.active {
        background: light-dark(var(--n-15), var(--n-85));
        color: light-dark(var(--n-10), var(--n-90));
        font-weight: 500;
      }

      .main-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        height: 100%;
        position: relative;
        overflow: hidden;
      }

      .content-area {
        flex: 1;
        overflow-y: auto;
        padding: var(--bb-grid-size-3);
        display: flex;
        flex-direction: column;
        gap: 16px;
        max-width: 900px;
        width: 100%;
        margin: 0 auto;
      }

      .input-area {
        padding: 16px;
        background: light-dark(var(--n-0), var(--n-100));
        border-top: 1px solid var(--n-80);
        width: 100%;
        max-width: 900px;
        margin: 0 auto;
      }

      #hero-img {
        width: 100%;
        max-width: 400px;
        aspect-ratio: 1280/720;
        height: auto;
        margin-bottom: var(--bb-grid-size-6);
        display: block;
        margin: 0 auto;
        background: var(--background-image-light) center center / contain
          no-repeat;
      }

      #surfaces {
        width: 100%;
        max-width: 100svw;
        /* padding: var(--bb-grid-size-3); */ /* Padding moved to content-area */
        animation: fadeIn 1s cubic-bezier(0, 0, 0.3, 1) 0.3s backwards;
      }

      form {
        display: flex;
        flex-direction: column;
        /* flex: 1; */ /* Form is no longer flex: 1 */
        gap: 16px;
        align-items: center;
        /* padding: 16px 0; */ /* Padding handled by input-area */
        animation: fadeIn 1s cubic-bezier(0, 0, 0.3, 1) 1s backwards;

        & h1 {
          color: light-dark(var(--p-40), var(--n-90));
        }

        & > div {
          display: flex;
          flex: 1;
          gap: 16px;
          align-items: center;
          width: 100%;

          & > input {
            display: block;
            flex: 1;
            border-radius: 32px;
            padding: 16px 24px;
            border: 1px solid var(--p-60);
            background: light-dark(var(--n-100), var(--n-10));
            font-size: 16px;
          }

          & > button {
            display: flex;
            align-items: center;
            background: var(--p-40);
            color: var(--n-100);
            border: none;
            padding: 8px 16px;
            border-radius: 32px;
            opacity: 0.5;

            &:not([disabled]) {
              cursor: pointer;
              opacity: 1;
            }
          }
        }
      }

      .rotate {
        animation: rotate 1s linear infinite;
      }

      .pending {
        width: 100%;
        min-height: 200px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        animation: fadeIn 1s cubic-bezier(0, 0, 0.3, 1) 0.3s backwards;
        gap: 16px;
      }

      .user-message {
        align-self: flex-end;
        background: var(--p-90);
        color: var(--n-10);
        padding: 12px 16px;
        border-radius: 16px 16px 0 16px;
        max-width: 80%;
        word-break: break-word;
      }

      .agent-message {
        align-self: flex-start;
        background: light-dark(var(--n-90), var(--n-20));
        color: light-dark(var(--n-10), var(--n-90));
        padding: 12px 16px;
        border-radius: 16px 16px 16px 0;
        max-width: 80%;
        word-break: break-word;
      }

      .spinner {
        width: 48px;
        height: 48px;
        border: 4px solid rgba(255, 255, 255, 0.1);
        border-left-color: var(--p-60);
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      .theme-toggle {
        padding: 0;
        margin: 0;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        position: fixed;
        top: var(--bb-grid-size-3);
        right: var(--bb-grid-size-4);
        background: light-dark(var(--n-100), var(--n-0));
        border-radius: 50%;
        color: var(--p-30);
        cursor: pointer;
        width: 48px;
        height: 48px;
        font-size: 32px;

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
        to {
          transform: rotate(360deg);
        }
      }

      @keyframes pulse {
        0% {
          opacity: 0.6;
        }
        50% {
          opacity: 1;
        }
        100% {
          opacity: 0.6;
        }
      }

      .error {
        color: var(--e-40);
        background-color: var(--e-95);
        border: 1px solid var(--e-80);
        padding: 16px;
        border-radius: 8px;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }

        to {
          opacity: 1;
        }
      }

      @keyframes rotate {
        from {
          rotate: 0deg;
        }

        to {
          rotate: 360deg;
        }
      }
    `,
  ];

  // #processor = v0_8.Data.createSignalA2uiMessageProcessor();
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

  connectedCallback() {
    super.connectedCallback();

    // Load config from URL
    const urlParams = new URLSearchParams(window.location.search);
    const appKey = urlParams.get("app") || "orchestrator";
    this.config = configs[appKey] || configs.orchestrator;

    // Apply the theme directly, which will use the Lit context.
    if (this.config.theme) {
      this.theme = this.config.theme;
    }

    window.document.title = this.config.title;
    window.document.documentElement.style.setProperty(
      "--background",
      this.config.background
    );

    // Initialize client with configured URL
    this.#a2uiClient = new A2UIClient(this.config.serverUrl);
  }

  render() {
    return html`
      ${this.#renderThemeToggle()}
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
                <span class="conversation-title"
                  >${conv.title || "New Chat"}</span
                >
              </div>
            `
          )}
        </div>
      </div>
      <div class="main-container">
        <div class="content-area">
          ${!this.#activeConversationId || this.#activeHistory.length === 0
            ? this.#renderWelcome()
            : nothing}
          ${this.#renderHistory()} ${this.#maybeRenderData()}
          ${this.#maybeRenderError()}
        </div>
        <div class="input-area">${this.#renderInputForm()}</div>
      </div>
    `;
  }

  #createNewChat() {
    const newConv: Conversation = {
      id: globalThis.crypto.randomUUID(),
      title: "",
      history: [],
      timestamp: Date.now(),
    };
    this.#conversations = [newConv, ...this.#conversations];
    this.#activeConversationId = newConv.id;
  }

  #selectConversation(id: string) {
    this.#activeConversationId = id;
  }

  #renderThemeToggle() {
    return html` <div>
      <button
        @click=${(evt: Event) => {
        if (!(evt.target instanceof HTMLButtonElement)) return;
        const { colorScheme } = window.getComputedStyle(evt.target);
        if (colorScheme === "dark") {
          document.body.classList.add("light");
          document.body.classList.remove("dark");
        } else {
          document.body.classList.add("dark");
          document.body.classList.remove("light");
        }
      }}
        class="theme-toggle"
      >
        <span class="g-icon filled-heavy"></span>
      </button>
    </div>`;
  }

  #renderWelcome() {
    return html`
      ${this.config.heroImage
        ? html`<div
            style=${styleMap({
              "--background-image-light": `url(${this.config.heroImage})`,
              "--background-image-dark": `url(${
                this.config.heroImageDark ?? this.config.heroImage
              })`,
            })}
            id="hero-img"
          ></div>`
        : nothing}
      <h1 class="app-title" style="text-align: center;">${this.config.title}</h1>
    `;
  }

  #renderHistory() {
    return html`
      ${this.#activeHistory.map((item) => {
        if (item.role === "user") {
          return html`<div class="user-message">${item.text}</div>`;
        }
        
        return html`<div class="agent-message">
            ${this.#renderAgentContent(item)}
        </div>`;
      })}
    `;
  }

  #renderAgentContent(item: any) {
      if (item.surfaces && item.processor) {
          const surfaces = Array.from(item.surfaces as Map<string, any>);
          if (surfaces.length > 0) {
             const [surfaceId, surface] = surfaces[surfaces.length - 1];
             return html`<a2ui-surface
                @a2uiaction=${async (
                  evt: v0_8.Events.StateEvent<"a2ui.action">
                ) => {
                  const [target] = evt.composedPath();
                  if (!(target instanceof HTMLElement)) {
                    return;
                  }

                  const context: v0_8.Types.A2UIClientEventMessage["userAction"]["context"] =
                    {};
                  if (evt.detail.action.context) {
                    const srcContext = evt.detail.action.context;
                    for (const ctxItem of srcContext) {
                      if (ctxItem.value.literalBoolean) {
                        context[ctxItem.key] = ctxItem.value.literalBoolean;
                      } else if (ctxItem.value.literalNumber) {
                        context[ctxItem.key] = ctxItem.value.literalNumber;
                      } else if (ctxItem.value.literalString) {
                        context[ctxItem.key] = ctxItem.value.literalString;
                      } else if (ctxItem.value.path) {
                        const path = item.processor.resolvePath(
                          ctxItem.value.path,
                          evt.detail.dataContextPath
                        );
                        const value = item.processor.getData(
                          evt.detail.sourceComponent,
                          path,
                          surfaceId
                        );
                        context[ctxItem.key] = value;
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

                  await this.#sendAndProcessMessage(message);
                }}
                .surfaceId=${surfaceId}
                .surface=${surface}
                .processor=${item.processor}
              ></a2ui-surface>`;
          }
      }

      if (item.text) {
          return html`<div>${item.text}</div>`;
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
        
        // Reset form
        evt.target.reset();

        const message = body as v0_8.Types.A2UIClientEventMessage;
        

        await this.#sendAndProcessMessage(message);
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

  // #maybeRenderForm removed

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
    message: v0_8.Types.A2UIClientEventMessage
  ): Promise<v0_8.Types.ServerToClientMessage[]> {
    try {
      this.#requesting = true;
      this.#startLoadingAnimation();
      const response = this.#a2uiClient.send(message);
      await response;
      this.#requesting = false;
      this.#stopLoadingAnimation();

      return response;
    } catch (err) {
      this.snackbar(err as string, SnackType.ERROR);
    } finally {
      this.#requesting = false;
      this.#stopLoadingAnimation();
    }

    return [];
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

  async #sendAndProcessMessage(request) {
    if (!this.#activeConversationId) {
      this.#createNewChat();
    }

    const conversationId = this.#activeConversationId!;
    let conversation = this.#conversations.find((c) => c.id === conversationId)!;

    let updatedHistory = conversation.history;
    let updatedTitle = conversation.title;

    // Add user message to history only if it is a string
    if (typeof request === "string") {
      const userHistoryItem: HistoryItem = {
        role: "user",
        text: request,
      };
      updatedHistory = [...conversation.history, userHistoryItem];

      // Update title if first message
      if (conversation.history.length === 0) {
        updatedTitle = request;
      }
    } else if (conversation.history.length === 0) {
      updatedTitle = "New Conversation";
    }

    // Update conversation state with user message
    this.#conversations = this.#conversations.map((c) =>
      c.id === conversationId
        ? { ...c, history: updatedHistory, title: updatedTitle }
        : c
    );

    const messages = await this.#sendMessage(request);

    console.log(messages);

    const processor = v0_8.Data.createSignalA2uiMessageProcessor();
    processor.processMessages(messages);
    const surfaces = processor.getSurfaces();

    const historyItem: any = {
        role: "agent",
        messages
    };

    if (surfaces.size > 0) {
      historyItem.processor = processor;
      historyItem.surfaces = surfaces;
    } else {
      // Extract text response from dataModelUpdate if present (created by client.ts for text responses)
      const textResponses: string[] = [];
      for (const msg of messages) {
        if (
          msg.dataModelUpdate?.surfaceId === "default" &&
          msg.dataModelUpdate.contents
        ) {
          for (const content of msg.dataModelUpdate.contents) {
            if (content.key === "response" && content.valueString) {
                textResponses.push(content.valueString);
            }
          }
        }
      }

      if (textResponses.length > 0) {
          historyItem.text = textResponses[textResponses.length - 1];
          historyItem.allTextResponses = textResponses;
      }
    }

    if (historyItem.surfaces || historyItem.text) {
        // Re-fetch conversation as it might have changed (though unlikely in single-threaded JS unless async happened)
        // Actually we are in async function, but we updated state before await.
        // We need to append to the *current* history of the conversation.

        this.#conversations = this.#conversations.map((c) =>
            c.id === conversationId
              ? { ...c, history: [...c.history, historyItem] }
              : c
          );
    }

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
        message: {
          id,
          message,
          type,
          persistent,
          actions,
        },
        replaceAll,
      });
      return;
    }

    return this.#snackbar.show(
      {
        id,
        message,
        type,
        persistent,
        actions,
      },
      replaceAll
    );
  }

  unsnackbar(id?: SnackbarUUID) {
    if (!this.#snackbar) {
      return;
    }

    this.#snackbar.hide(id);
  }
}
