import { createContext, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ObjectType, Action } from "../data/constants";
import useAreas from "../hooks/useAreas";
import useDiagram from "../hooks/useDiagram";
import useEnums from "../hooks/useEnums";
import useLayout from "../hooks/useLayout";
import useSelect from "../hooks/useSelect";
import useSettings from "../hooks/useSettings";
import useUndoRedo from "../hooks/useUndoRedo";
import { useExtensions } from "./ExtensionsContext";
import { createAiClient } from "../api/ai";
import {
  applyPlanToDiagram,
  buildAiDiagramSnapshot,
  describeAiPlan,
  normalizeAiPlan,
  validateAiPlan,
} from "../utils/aiPlan";
import { diffDiagram } from "../utils/dbml/diff";
import { applyDiagramPlan } from "../utils/dbml/applyPlan";
import { runLayout } from "../utils/layout";

const STORAGE_KEY = "drawdb:aiSettings";

export const DEFAULT_AI_SETTINGS = {
  enabled: false,
  provider: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  model: "",
  temperature: 0.2,
};

export const AiContext = createContext(null);

function makeId() {
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `ai-message-${random}`;
}

function loadSettings() {
  if (typeof localStorage === "undefined") return DEFAULT_AI_SETTINGS;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return { ...DEFAULT_AI_SETTINGS, ...(stored ?? {}) };
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

function persistSettings(settings) {
  if (typeof localStorage === "undefined") return;
  const { enabled, provider, baseUrl, model, temperature } = settings;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ enabled, provider, baseUrl, model, temperature }),
  );
}

export default function AiContextProvider({ children }) {
  const { t } = useTranslation();
  const extensions = useExtensions();
  const { tables, relationships, database, ...diagramActions } = useDiagram();
  const { enums, setEnums } = useEnums();
  const { areas } = useAreas();
  const { settings: editorSettings } = useSettings();
  const { layout } = useLayout();
  const { selectedElement, bulkSelectedElements } = useSelect();
  const { setUndoStack, setRedoStack } = useUndoRedo();

  const [aiSettings, setAiSettings] = useState(loadSettings);
  const [apiKey, setApiKey] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const extensionAiAvailable = typeof extensions?.aiChat === "function";
  const isConfigured = Boolean(
    aiSettings.enabled &&
      aiSettings.model?.trim() &&
      (extensionAiAvailable || apiKey.trim()),
  );

  const open = useCallback(() => {
    setIsOpen(true);
    setError("");
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const saveAiSettings = useCallback((values) => {
    setAiSettings((previous) => {
      const next = { ...previous, ...values };
      persistSettings(next);
      return next;
    });
  }, []);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setError("");
    setStatus("idle");
  }, []);

  const sendMessage = useCallback(
    async (value) => {
      const content = String(value ?? "").trim();
      if (!content) return;
      if (!isConfigured) {
        setError(t("ai_not_configured"));
        setStatus("error");
        return;
      }

      const userMessage = {
        id: makeId(),
        role: "user",
        content,
      };
      const requestMessages = [...messages, userMessage].map(
        ({ role, content: messageContent }) => ({
          role,
          content: messageContent,
        }),
      );
      const diagram = buildAiDiagramSnapshot({
        database,
        tables,
        relationships,
      });
      const selectedTableIds = [
        ...new Set([
          ...(selectedElement?.element === ObjectType.TABLE
            ? [selectedElement.id]
            : []),
          ...bulkSelectedElements
            .filter((element) => element.type === ObjectType.TABLE)
            .map((element) => element.id),
        ]),
      ];

      setMessages((previous) => [...previous, userMessage]);
      setStatus("loading");
      setError("");

      try {
        const client = createAiClient({
          settings: { ...aiSettings, apiKey },
          extension: extensions?.aiChat,
        });
        const response = await client.chat({
          messages: requestMessages,
          diagram,
          database,
          selectedTableIds,
          model: aiSettings.model,
        });

        let plan = null;
        let warnings = [...(response.warnings ?? [])];
        if (response.operations?.length || response.layout) {
          const validation = validateAiPlan(response, {
            tables,
            relationships,
          });
          warnings = [...warnings, ...validation.warnings];
          if (validation.valid) {
            plan = normalizeAiPlan(response, { tables, relationships });
          } else {
            warnings = [...warnings, ...validation.errors];
          }
        }

        setMessages((previous) => [
          ...previous,
          {
            id: makeId(),
            role: "assistant",
            content: response.message || t("ai_empty_response"),
            plan,
            planSummary: plan ? describeAiPlan(plan) : null,
            warnings,
          },
        ]);
        setStatus("ready");
      } catch (requestError) {
        setError(requestError?.message || t("ai_request_failed"));
        setStatus("error");
      }
    },
    [
      aiSettings,
      apiKey,
      bulkSelectedElements,
      database,
      extensions,
      isConfigured,
      messages,
      relationships,
      selectedElement,
      t,
      tables,
    ],
  );

  const applyPlan = useCallback(
    async (plan) => {
      if (layout.readOnly) {
        setError(t("ai_read_only"));
        return false;
      }

      try {
        const current = { tables, relationships, enums };
        const validation = validateAiPlan(plan, { tables, relationships });
        if (!validation.valid) {
          throw new Error(validation.errors.join(" "));
        }
        const normalized = normalizeAiPlan(plan, { tables, relationships });
        const next = applyPlanToDiagram(current, normalized);

        if (normalized.layout?.engineId) {
          const layoutResult = await runLayout(
            normalized.layout.engineId,
            {
              tables: next.tables,
              relationships: next.relationships,
              areas,
              settings: editorSettings,
            },
            normalized.layout,
          );
          const positionsById = new Map(
            layoutResult.tables.map((position) => [position.id, position]),
          );
          next.tables = next.tables.map((table) => {
            const position = positionsById.get(table.id);
            return position
              ? { ...table, x: position.x, y: position.y }
              : table;
          });
        }

        const operations = diffDiagram(current, next, {
          includePositions: true,
        });
        if (!operations.length) {
          setError(t("ai_no_changes"));
          return false;
        }

        setUndoStack((previous) => [
          ...previous,
          {
            action: Action.EDIT,
            element: ObjectType.DBML,
            data: {
              snapshot: current,
              includePositions: true,
            },
            message: t("ai_apply_changes"),
          },
        ]);
        setRedoStack([]);
        applyDiagramPlan(operations, {
          addTable: diagramActions.addTable,
          updateTable: diagramActions.updateTable,
          updateField: diagramActions.updateField,
          deleteTable: diagramActions.deleteTable,
          addRelationship: diagramActions.addRelationship,
          updateRelationship: diagramActions.updateRelationship,
          deleteRelationship: diagramActions.deleteRelationship,
          setEnums,
        });
        setMessages((previous) =>
          previous.map((message) =>
            message.plan === plan ? { ...message, applied: true } : message,
          ),
        );
        setError("");
        setStatus("ready");
        return true;
      } catch (applyError) {
        setError(applyError?.message || t("ai_apply_failed"));
        setStatus("error");
        return false;
      }
    },
    [
      areas,
      diagramActions,
      editorSettings,
      enums,
      layout.readOnly,
      relationships,
      setEnums,
      setRedoStack,
      setUndoStack,
      t,
      tables,
    ],
  );

  const dismissPlan = useCallback((plan) => {
    setMessages((previous) =>
      previous.map((message) =>
        message.plan === plan
          ? { ...message, plan: null, dismissed: true }
          : message,
      ),
    );
  }, []);

  const value = useMemo(
    () => ({
      aiSettings,
      apiKey,
      clearConversation,
      close,
      closeSettings,
      dismissPlan,
      error,
      extensionAiAvailable,
      isConfigured,
      isOpen,
      messages,
      pendingPlans: messages.filter((message) => message.plan),
      open,
      openSettings,
      applyPlan,
      saveAiSettings,
      sendMessage,
      setApiKey,
      settingsOpen,
      status,
    }),
    [
      aiSettings,
      apiKey,
      applyPlan,
      clearConversation,
      close,
      closeSettings,
      dismissPlan,
      error,
      extensionAiAvailable,
      isConfigured,
      isOpen,
      messages,
      open,
      openSettings,
      saveAiSettings,
      sendMessage,
      settingsOpen,
      status,
    ],
  );

  return <AiContext.Provider value={value}>{children}</AiContext.Provider>;
}
