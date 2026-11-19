import { useState } from "react";
import {
  Banner,
  Button,
  Popconfirm,
  Spin,
  Tag,
  TextArea,
} from "@douyinfe/semi-ui";
import {
  IconClose,
  IconDeleteStroked,
  IconExpand,
  IconMinus,
} from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import { useAi, useDiagram, useLayout } from "../hooks";
import { databases } from "../data/databases";

function operationText(operation) {
  const action = operation.action ?? "update";
  const target = operation.target ?? "diagram";
  if (target === "relationship" && operation.relationship) {
    const relationship = operation.relationship;
    return `${action} relationship ${relationship.name || `${relationship.startTableId} → ${relationship.endTableId}`}`;
  }
  if (target === "table" && operation.table) {
    return `${action} table ${operation.table.name}`;
  }
  return `${action} ${target}`;
}

function PlanPreview({ message, onApply, onDismiss, readOnly }) {
  const { t } = useTranslation();
  const summary = message.planSummary;
  const plan = message.plan;
  if (!plan || !summary) return null;

  const applyButton = (onClick) => (
    <Button theme="solid" size="small" disabled={readOnly} onClick={onClick}>
      {t("ai_apply")}
    </Button>
  );

  return (
    <div className="mt-3 rounded-lg border border-[var(--semi-color-border)] bg-[var(--semi-color-fill-0)] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{t("ai_view_changes")}</div>
        {message.applied && <Tag color="green">{t("ai_applied")}</Tag>}
      </div>
      <div className="mt-2 text-xs opacity-80">
        {t("ai_changes_summary", summary)}
        {summary.layout && (
          <div className="mt-1">
            {t("ai_layout_summary", { layout: summary.layout })}
          </div>
        )}
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer select-none">
          {t("ai_view_changes")}
        </summary>
        <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
          {(plan.operations ?? []).map((operation, index) => (
            <div
              key={index}
              className="rounded bg-[var(--semi-color-fill-1)] px-2 py-1"
            >
              {operationText(operation)}
            </div>
          ))}
        </div>
      </details>
      {plan.warnings?.length > 0 && (
        <div className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-300">
          {plan.warnings.slice(0, 3).map((warning, index) => (
            <div key={index}>{warning}</div>
          ))}
        </div>
      )}
      {!message.applied && (
        <div className="mt-3 flex justify-end gap-2">
          <Button size="small" type="tertiary" onClick={() => onDismiss(plan)}>
            {t("ai_dismiss")}
          </Button>
          {summary.destructive ? (
            <Popconfirm
              title={t("ai_confirm_destructive")}
              content={t("ai_confirm_destructive_description")}
              onConfirm={() => onApply(plan)}
              okText={t("ai_apply")}
              cancelText={t("cancel")}
            >
              {applyButton(undefined)}
            </Popconfirm>
          ) : (
            applyButton(() => onApply(plan))
          )}
        </div>
      )}
    </div>
  );
}

export default function AiChatPanel() {
  const { t } = useTranslation();
  const { tables, relationships, database } = useDiagram();
  const { layout } = useLayout();
  const {
    apiKey,
    aiSettings,
    clearConversation,
    close,
    dismissPlan,
    error,
    isConfigured,
    isOpen,
    isMinimized,
    minimize,
    messages,
    openSettings,
    applyPlan,
    restore,
    sendMessage,
    status,
  } = useAi();
  const [input, setInput] = useState("");
  const [lastPrompt, setLastPrompt] = useState("");

  if (!isOpen) return null;

  if (isMinimized) {
    return (
      <button
        type="button"
        className="absolute right-4 top-4 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-amber-500/60 bg-amber-400 text-amber-950 shadow-lg transition hover:bg-amber-300"
        title={t("ai_restore")}
        aria-label={t("ai_restore")}
        onClick={restore}
      >
        <IconExpand size="small" />
      </button>
    );
  }

  const submit = async (value = input) => {
    const prompt = String(value ?? "").trim();
    if (!prompt) return;
    setLastPrompt(prompt);
    setInput("");
    await sendMessage(prompt);
  };

  const databaseName = databases[database]?.name ?? database;

  return (
    <aside className="absolute right-4 top-4 z-30 flex h-[min(720px,calc(100%-2rem))] w-[min(380px,calc(100%-2rem))] flex-col overflow-hidden rounded-xl border border-[var(--semi-color-border)] bg-[var(--semi-color-bg-1)] shadow-2xl">
      <div className="flex items-center justify-between border-b border-[var(--semi-color-border)] px-4 py-3">
        <div>
          <div className="font-semibold">{t("ai_assistant")}</div>
          <div className="mt-0.5 text-xs opacity-70">
            {t("ai_summary", {
              tables: tables.length,
              relationships: relationships.length,
              database: databaseName,
            })}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-500/60 bg-amber-400 text-amber-950 shadow-sm transition hover:bg-amber-300"
            title={t("ai_minimize")}
            aria-label={t("ai_minimize")}
            onClick={minimize}
          >
            <IconMinus size="small" />
          </button>
          <Button
            type="tertiary"
            theme="borderless"
            icon={<IconDeleteStroked />}
            aria-label={t("ai_clear")}
            onClick={clearConversation}
          />
          <Button
            type="tertiary"
            theme="borderless"
            icon={<IconClose />}
            aria-label={t("ai_close")}
            onClick={close}
          />
        </div>
      </div>

      {!isConfigured ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="text-3xl">✦</div>
          <div className="font-semibold">{t("ai_not_configured")}</div>
          <div className="text-sm opacity-70">
            {aiSettings.model
              ? t("ai_api_key_required")
              : t("ai_model_settings")}
          </div>
          <Button theme="solid" onClick={openSettings}>
            {t("ai_model_settings")}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="rounded-lg bg-[var(--semi-color-fill-0)] p-3 text-sm opacity-80">
                  {t("ai_quick_check")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    "ai_quick_check",
                    "ai_quick_connect",
                    "ai_quick_layout",
                  ].map((key) => (
                    <Button
                      key={key}
                      size="small"
                      type="tertiary"
                      onClick={() => submit(t(key))}
                    >
                      {t(key)}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === "user"
                    ? "flex justify-end"
                    : "flex justify-start"
                }
              >
                <div
                  className={`max-w-[92%] rounded-lg px-3 py-2 text-sm ${
                    message.role === "user"
                      ? "bg-[var(--semi-color-primary-light-default)]"
                      : "bg-[var(--semi-color-fill-0)]"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  {message.warnings?.length > 0 && (
                    <div className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-300">
                      {message.warnings.slice(0, 3).map((warning, index) => (
                        <div key={index}>{warning}</div>
                      ))}
                    </div>
                  )}
                  <PlanPreview
                    message={message}
                    onApply={applyPlan}
                    onDismiss={dismissPlan}
                    readOnly={layout.readOnly}
                  />
                </div>
              </div>
            ))}

            {status === "loading" && (
              <div className="flex items-center gap-2 text-sm opacity-70">
                <Spin size="small" />
                {t("loading")}
              </div>
            )}

            {error && (
              <Banner
                type="danger"
                fullMode={false}
                description={
                  <div className="flex items-center justify-between gap-2">
                    <span>{error}</span>
                    {lastPrompt && (
                      <Button
                        size="small"
                        type="tertiary"
                        onClick={() => submit(lastPrompt)}
                      >
                        {t("retry")}
                      </Button>
                    )}
                  </div>
                }
              />
            )}
          </div>

          <div className="border-t border-[var(--semi-color-border)] p-3">
            <TextArea
              value={input}
              autosize={{ minRows: 2, maxRows: 5 }}
              placeholder={t("ai_placeholder")}
              onChange={setInput}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-xs opacity-60">
                {apiKey ? t("ai_api_key_saved_for_session") : aiSettings.model}
              </div>
              <Button
                theme="solid"
                icon={<i className="fa-solid fa-paper-plane" />}
                disabled={!input.trim() || status === "loading"}
                onClick={() => submit()}
              >
                {t("ai_send")}
              </Button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
