import { useEffect, useState } from "react";
import {
  Banner,
  Button,
  Checkbox,
  Input,
  Modal,
  Typography,
} from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { useAi } from "../hooks";

export default function AiSettingsModal() {
  const { t } = useTranslation();
  const {
    aiSettings,
    apiKey,
    closeSettings,
    extensionAiAvailable,
    saveAiSettings,
    setApiKey,
    settingsOpen,
  } = useAi();
  const [draft, setDraft] = useState(aiSettings);
  const [draftApiKey, setDraftApiKey] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!settingsOpen) return;
    setDraft(aiSettings);
    setDraftApiKey("");
    setError("");
  }, [aiSettings, settingsOpen]);

  const update = (key, value) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  const handleSave = () => {
    if (!draft.model.trim()) {
      setError(t("ai_model_required"));
      return;
    }

    try {
      new URL(draft.baseUrl);
    } catch {
      setError(t("ai_base_url_invalid"));
      return;
    }

    if (
      draft.enabled &&
      !extensionAiAvailable &&
      !draftApiKey.trim() &&
      !apiKey
    ) {
      setError(t("ai_api_key_required"));
      return;
    }

    saveAiSettings({
      enabled: draft.enabled,
      provider: draft.provider,
      baseUrl: draft.baseUrl.trim(),
      model: draft.model.trim(),
      temperature: Number(draft.temperature) || 0.2,
    });
    if (draftApiKey.trim()) setApiKey(draftApiKey.trim());
    closeSettings();
  };

  return (
    <Modal
      visible={settingsOpen}
      centered
      title={t("ai_model_settings")}
      onCancel={closeSettings}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="tertiary" onClick={closeSettings}>
            {t("cancel")}
          </Button>
          <Button theme="solid" onClick={handleSave}>
            {t("save")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Checkbox
          checked={draft.enabled}
          onChange={(event) => update("enabled", event.target.checked)}
        >
          {t("enable_ai_assistant")}
        </Checkbox>

        {extensionAiAvailable && (
          <Banner
            type="info"
            fullMode={false}
            description={t("ai_hosted_client_available")}
          />
        )}

        <div>
          <Typography.Text strong>{t("ai_provider")}</Typography.Text>
          <Input value={draft.provider} readonly className="mt-1" />
        </div>

        <div>
          <Typography.Text strong>{t("ai_base_url")}</Typography.Text>
          <Input
            value={draft.baseUrl}
            onChange={(value) => update("baseUrl", value)}
            className="mt-1"
            placeholder="https://api.openai.com/v1"
          />
        </div>

        <div>
          <Typography.Text strong>{t("ai_model")}</Typography.Text>
          <Input
            value={draft.model}
            onChange={(value) => update("model", value)}
            className="mt-1"
            placeholder="gpt-4o-mini"
          />
        </div>

        {!extensionAiAvailable && (
          <div>
            <Typography.Text strong>{t("ai_api_key")}</Typography.Text>
            <Input
              type="password"
              value={draftApiKey}
              onChange={setDraftApiKey}
              className="mt-1"
              placeholder={
                apiKey ? t("ai_api_key_saved_for_session") : "sk-..."
              }
            />
            <div className="text-xs opacity-70 mt-1">
              {t("ai_api_key_session_only")}
            </div>
          </div>
        )}

        {error && <Banner type="danger" fullMode={false} description={error} />}
      </div>
    </Modal>
  );
}
