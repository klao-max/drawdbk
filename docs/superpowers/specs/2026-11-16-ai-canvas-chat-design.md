# 画布内 AI 数据模型助手设计

## 1. 背景

drawDB 已经具备完整的数据库图表编辑能力：表、字段和关系由 `DiagramContext` 管理，画布支持选择与布局，编辑器具备撤销/重做，并且已有一套 DBML 变更计划机制。当前仓库还没有模型配置入口和画布内对话界面，但已经通过 `ExtensionsContext` 为 AI SQL 导入预留了 `importSqlWithAi` 接口。

本功能在现有编辑器中增加一个画布内 AI 助手，让用户在配置模型后，通过自然语言检查、整理和修改当前图表。AI 先返回结构化变更计划，用户确认后才应用到图表。

## 2. 目标

1. 用户可以在编辑器设置中配置一个 OpenAI-compatible 模型。
2. 用户可以从画布工具栏打开 AI 对话面板，不离开当前画布。
3. AI 可以读取当前数据库类型、表、字段、关系和用户选中的表。
4. AI 可以提出并执行以下变更：
   - 新增、修改表；
   - 新增、修改、删除字段；
   - 新增、修改、删除关系；
   - 调用现有布局引擎重新排列表。
5. AI 返回的变更必须经过前端校验、预览和用户确认。
6. 一次 AI 应用操作产生一个撤销步骤，并触发现有自动保存流程。
7. 模型调用失败、返回格式错误或关系引用无效时，不能污染当前图表。

## 3. 非目标

第一版不包含：

- 直接执行 SQL 或连接真实数据库；
- 让 AI 自动删除整张表而不经过明确的二次确认；
- 修改视图、主题区域、便签和自定义类型；
- 多轮工具调用、后台任务和团队共享的 AI 对话历史；
- 将用户 API Key 上传到 drawDB 的公共服务。

## 4. 用户体验

### 4.1 模型配置

在现有 Settings 菜单中增加 `AI model` 入口，打开一个独立设置弹窗。第一版字段：

- Provider：`OpenAI-compatible`；
- Base URL：默认 `https://api.openai.com/v1`；
- Model：必填字符串，例如 `gpt-4o-mini`；
- API Key：密码输入框；
- 是否启用 AI：开关。

模型、Provider 和 Base URL 保存在 `localStorage` 的 `aiSettings` 中。API Key 只保存在当前浏览器会话内存中，不写入 diagram、IndexedDB 或 localStorage。刷新页面后需要重新输入 Key；通过宿主扩展提供的服务端 AI 客户端不需要在浏览器保存 Key。

### 4.2 打开对话

在编辑器底部工具栏的自动布局按钮附近增加 AI 按钮。点击后，在画布容器右上角打开一个宽度约 380px、最大高度为视口高度减去边距的浮动面板。面板不改变画布缩放和平移状态，可以关闭、重新打开，并在画布和侧边栏之间保持独立滚动。

未配置模型时，面板显示配置提示和“打开设置”按钮；只读版本或历史版本中，面板可以查看对话，但“应用变更”按钮禁用。

### 4.3 对话和建议

面板包含：

- 消息列表；
- 当前图表摘要（表数量、关系数量、数据库类型）；
- 当前选中表的上下文标签；
- 输入框和发送按钮；
- 常用提示：检查孤立表、补齐外键、重新布局。

AI 回复包含自然语言说明和可选的变更计划。存在计划时，消息下方显示变更摘要，例如“新增 1 条关系、修改 2 个字段、重新布局 8 张表”，并提供：

- `查看变更`：展开具体操作；
- `应用变更`：执行计划；
- `忽略`：丢弃计划。

AI 只能基于当前快照生成计划。发送新消息时，前端重新生成快照，不使用过期的表和关系数据。

## 5. 结构化 AI 协议

### 5.1 请求

统一的客户端接口为：

```js
aiChat({
  messages,
  diagram,
  database,
  selectedTableIds,
  model,
});
```

其中 `diagram` 只包含 AI 所需的结构字段：

```js
{
  tables: [{
    id,
    name,
    comment,
    fields: [{ id, name, type, primary, unique, notNull, comment }]
  }],
  relationships: [{
    id,
    name,
    startTableId,
    startFieldId,
    endTableId,
    endFieldId,
    cardinality,
    updateConstraint,
    deleteConstraint
  }],
  database
}
```

默认不发送表的颜色、锁定状态、便签、主题区域和完整历史记录。选中表的 ID 单独传递，模型可以据此缩小关注范围。

### 5.2 响应

模型必须返回 JSON envelope：

```json
{
  "message": "我发现 orders.user_id 与 users.id 可以建立多对一关系。",
  "operations": [
    {
      "target": "relationship",
      "action": "create",
      "relationship": {
        "name": "orders_user_id_users_id",
        "startTableId": "orders-id",
        "startFieldId": "orders-user-id",
        "endTableId": "users-id",
        "endFieldId": "users-id-field",
        "cardinality": "many_to_one",
        "updateConstraint": "No action",
        "deleteConstraint": "No action"
      }
    }
  ],
  "layout": {
    "engineId": "elk_layered"
  },
  "warnings": []
}
```

允许的操作：

- `table.create`：包含完整表和字段；
- `table.update`：只包含允许更新的字段，字段列表变化时可以提供完整 `fields`；
- `table.delete`：只允许在用户明确输入删除意图时返回，应用前二次确认；
- `field.update`：更新现有字段；
- `relationship.create`、`relationship.update`、`relationship.delete`；
- `layout`：调用已有布局引擎，第一版只接受 `dagre_left_to_right`、`dagre_top_to_bottom`、`elk_layered`、`elk_stress`、`by_subject_area`。

AI 不负责生成前端 ID。对不存在的 ID，前端先尝试按表名和字段名解析；无法唯一解析时拒绝该操作并显示警告。新建表、字段和关系的 ID 由前端生成唯一值。

## 6. 客户端架构

### 6.1 AI 状态

新增 `AiContext` 和 `useAi`，职责包括：

- 保存模型配置和当前会话消息；
- 暴露 `open`, `close`, `sendMessage`, `applyPlan`, `clearConversation`；
- 管理 `idle`、`loading`、`error`、`ready` 状态；
- 保存当前待确认计划；
- 在发送时读取最新 diagram 状态，而不是把快照长期放在组件内部。

`SettingsContext` 继续只管理编辑器显示设置；AI 配置单独存储，避免把 API Key 和图表 UI 设置混在一起。

### 6.2 AI 客户端

新增 `src/api/ai.js`，定义 provider-agnostic 的 `createAiClient`：

1. 如果 `ExtensionsContext` 提供 `aiChat` 函数，优先调用该函数。宿主应用可以使用服务端代理、登录态和流式响应。
2. 否则使用 OpenAI-compatible HTTP adapter，向 `${baseUrl}/chat/completions` 发送请求。
3. 客户端统一解析响应为 `{ message, operations, layout, warnings }`，并把非 JSON 回复降级为只有文本的 assistant 消息。

现有 `ExtensionsContext` 不变，只增加可选的 `aiChat` 扩展字段，因此当前 SQL AI 导入仍然兼容。

### 6.3 计划校验与应用

新增 `src/utils/aiPlan.js`，包含以下纯函数：

- `buildAiDiagramSnapshot(diagram)`：生成脱敏的模型上下文；
- `validateAiPlan(plan, diagram)`：校验目标、动作、字段和关系引用；
- `normalizeAiPlan(plan, diagram)`：补充新 ID、解析名称引用、去重关系；
- `describeAiPlan(plan, diagram)`：生成预览摘要；
- `applyAiPlan(plan, context)`：将结构操作转换为现有 `applyDiagramPlan` 所需的操作。

计划应用采用两阶段：

1. 在内存中校验并生成 normalized plan；任一步失败则不触碰 React 状态。
2. 应用前记录当前 `tables`、`relationships` 和 `enums` 快照，随后执行结构操作和布局操作。

布局操作复用 `runLayout`。为了让“结构变更 + 布局”只有一个撤销步骤，扩展现有 DBML snapshot 机制：AI 产生的 undo entry 标记 `includePositions: true`，`diffDiagram` 在该标记下把 `x/y` 纳入 table diff；普通 DBML 编辑继续忽略位置变化。

### 6.4 UI 挂载点

- `Workspace` 在 `CanvasContextProvider` 外层保留 AI 面板的定位容器；
- 复用现有 `Slot name="canvas-overlay"` 扩展点，核心版本直接渲染 `AiChatPanel`；
- `ControlPanel` 只负责按钮和打开动作，不持有对话数据；
- 面板使用 Semi UI 现有 `Input`、`Button`、`Spin` 和 `Banner`，样式遵循当前主题变量。

## 7. 错误处理和安全边界

- 没有模型配置：显示设置入口，不发请求。
- API Key 缺失：发送按钮禁用，并在面板内提示。
- HTTP 错误：保留用户输入和之前消息，显示可重试错误。
- 模型返回非法 JSON：保留文本回复，不生成可应用计划。
- 计划引用不存在的表或字段：拒绝对应操作，显示具体警告。
- 计划包含删除表：必须在预览中显示明确的危险状态，并要求再次确认。
- 当前图表为只读：允许提问，禁止应用。
- 应用期间发生异常：不清空原状态，显示失败；应用操作使用前置校验，避免半应用。
- 默认只发送结构化 schema，不发送便签和历史记录。
- API Key 不进入 IndexedDB、diagram JSON、分享链接或自动保存数据。

## 8. 持久化和协作

AI 对话历史只保存在当前页面内存中，不写入 diagram。模型设置保存到浏览器 localStorage，但 API Key 不持久化。

应用计划时继续调用 `DiagramContext` 的现有 actions，因此已有协作扩展可以接收表、字段和关系变更。AI 对话本身不通过协作通道广播。

## 9. 测试策略

当前仓库没有测试脚本，因此第一阶段增加 Vitest 和最小 `npm test` 脚本，优先测试纯函数：

1. snapshot 不包含敏感字段和布局字段；
2. 合法计划可以规范化并生成正确的 apply operations；
3. 不存在的表、字段和关系引用会被拒绝；
4. 重复关系不会重复创建；
5. 布局计划只接受白名单引擎；
6. `diffDiagram(..., { includePositions: true })` 可以恢复表位置，默认行为仍忽略位置；
7. AI 客户端可以解析标准 JSON 响应和纯文本降级响应。

UI 验证包括：

- 未配置模型时的空状态；
- 请求加载、失败、重试；
- 变更预览和应用；
- 只读图表禁用应用；
- 应用后撤销和重做；
- 主题切换和窄屏布局。

## 10. 分阶段交付

### Phase 1：可用 MVP

- AI 设置弹窗；
- OpenAI-compatible client 和 extension client；
- 画布内聊天面板；
- 表、字段、关系计划预览和应用；
- 单步撤销；
- 纯函数测试。

### Phase 2：体验增强

- 流式输出；
- 常用提示和选中表上下文；
- 布局计划预览；
- 更细的风险提示和关系冲突解释。

### Phase 3：托管能力

- 服务端代理；
- 登录态和配额；
- 团队级模型配置；
- 对话记录和审计。
