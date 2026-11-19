import { Button, Tag } from "@douyinfe/semi-ui";
import { IconClose } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import { ObjectType } from "../../data/constants";
import { useDiagram, useSelect, useSettings } from "../../hooks";

function getRelatedTableId(relationship, tableId) {
  return relationship.startTableId === tableId
    ? relationship.endTableId
    : relationship.startTableId;
}

function getLocalFieldNames(relationship, tableId, tables) {
  const table = tables.find((item) => item.id === tableId);
  const fieldIds = (relationship.fields ?? [])
    .filter((pair) =>
      relationship.startTableId === tableId
        ? pair.startFieldId
        : pair.endFieldId,
    )
    .map((pair) =>
      relationship.startTableId === tableId
        ? pair.startFieldId
        : pair.endFieldId,
    );
  return fieldIds
    .map((fieldId) => table?.fields?.find((field) => field.id === fieldId))
    .filter(Boolean)
    .map((field) => field.name)
    .join(", ");
}

export default function TablePreviewPanel() {
  const { t } = useTranslation();
  const { tables, relationships } = useDiagram();
  const { selectedElement, setSelectedElement } = useSelect();
  const { settings } = useSettings();

  if (selectedElement.element !== ObjectType.TABLE || selectedElement.open) {
    return null;
  }

  const table = tables.find((item) => item.id === selectedElement.id);
  if (!table) return null;

  const relatedRelationships = relationships
    .filter(
      (relationship) =>
        relationship.startTableId === table.id ||
        relationship.endTableId === table.id,
    )
    .map((relationship) => {
      const relatedTable = tables.find(
        (item) => item.id === getRelatedTableId(relationship, table.id),
      );
      return {
        relationship,
        relatedTable,
        localFields: getLocalFieldNames(relationship, table.id, tables),
      };
    });

  const close = () =>
    setSelectedElement((previous) => ({
      ...previous,
      element: ObjectType.NONE,
      id: -1,
      open: false,
    }));

  return (
    <aside
      className={`pointer-events-auto absolute left-4 top-4 z-30 flex w-[min(390px,calc(100%-2rem))] max-w-full flex-col overflow-hidden rounded-xl border shadow-xl ${
        settings.mode === "light"
          ? "border-zinc-200 bg-white/95 text-zinc-800"
          : "border-zinc-700 bg-zinc-900/95 text-zinc-100"
      } backdrop-blur-sm`}
      style={{ maxHeight: "calc(100% - 32px)" }}
      aria-label={t("table_preview")}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3 border-b border-color px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs opacity-60">{t("table_preview")}</div>
          <div className="mt-1 break-words font-semibold">{table.name}</div>
          {table.comment && (
            <div className="mt-1 break-words text-xs opacity-70">
              {table.comment}
            </div>
          )}
        </div>
        <Button
          type="tertiary"
          theme="borderless"
          size="small"
          icon={<IconClose />}
          aria-label={t("close")}
          onClick={close}
        />
      </div>

      <div className="min-h-0 overflow-y-auto px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">{t("fields")}</div>
          <Tag size="small">{table.fields?.length ?? 0}</Tag>
        </div>

        {table.fields?.length ? (
          <div className="overflow-hidden rounded-lg border border-color">
            {table.fields.map((field) => (
              <div
                key={field.id}
                className="border-b border-color px-3 py-2 last:border-b-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 break-words font-medium">
                    {field.name}
                  </div>
                  <div className="shrink-0 text-xs opacity-70">
                    {field.type}
                    {field.size ? `(${field.size})` : ""}
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {field.primary && (
                    <Tag size="small" color="blue">
                      {t("primary_key")}
                    </Tag>
                  )}
                  {field.unique && (
                    <Tag size="small" color="green">
                      {t("unique")}
                    </Tag>
                  )}
                  {field.notNull && (
                    <Tag size="small" color="orange">
                      {t("not_null")}
                    </Tag>
                  )}
                  {field.default !== undefined && field.default !== "" && (
                    <span className="max-w-full break-words text-xs opacity-70">
                      {t("default_value")}: {field.default}
                    </span>
                  )}
                </div>
                {settings.showComments && field.comment && (
                  <div className="mt-1 break-words text-xs opacity-70">
                    {field.comment}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm opacity-60">{t("no_table_fields")}</div>
        )}

        <div className="mb-2 mt-4 flex items-center justify-between">
          <div className="text-sm font-semibold">{t("relationships")}</div>
          <Tag size="small">{relatedRelationships.length}</Tag>
        </div>
        {relatedRelationships.length ? (
          <div className="space-y-2">
            {relatedRelationships.map(
              ({ relationship, relatedTable, localFields }) => (
                <div
                  key={relationship.id}
                  className="rounded-lg border border-color px-3 py-2 text-sm"
                >
                  <div className="break-words font-medium">
                    {relatedTable?.name || t("not_set")}
                  </div>
                  <div className="mt-1 break-words text-xs opacity-70">
                    {localFields || t("not_set")}
                    {relationship.name ? ` · ${relationship.name}` : ""}
                  </div>
                </div>
              ),
            )}
          </div>
        ) : (
          <div className="text-sm opacity-60">
            {t("no_table_relationships")}
          </div>
        )}
      </div>
    </aside>
  );
}
