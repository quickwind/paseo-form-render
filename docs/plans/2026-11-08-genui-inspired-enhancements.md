# 借鉴 genui 的增强计划(阶段 A)

范围:只做 ① 宽容 JSON 解析、② JSON 与标签式格式对比实验。其余点子(标签式解析器、新节点、流式渲染、`source`、`visibleIf`)等阶段 A 数据出来后再定。

## ① 宽容 JSON 解析

**目标**:让低端模型常见的 JSON 小错误(末尾逗号、注释、单引号、未闭合括号)不再整块失败,减少一次"请 agent 修复"的往返。

**约束**
- `shared/` 两端共用,客户端不能新增运行时依赖,所以手写一个小型修复器(`shared/json-repair.ts`),不引入 jsonrepair/JSON5。
- 必须兼容 Hermes:不用 `class`,不用 Node 专有 API。
- 修复后的结果仍要通过 `PfrFormSchema`;修复器只改语法,不猜结构。

**步骤**
1. 先写测试(`shared/json-repair.test.ts`):末尾逗号、`//` 与 `/* */` 注释、单引号字符串、未加引号的键、缺失的结尾 `}` / `]`、字符串内含这些符号时不能被误改、合法 JSON 原样返回。
2. 实现 `repairJson(text): { text: string; repaired: boolean }`,逐字符扫描并跟踪是否在字符串内。
3. 接入 `shared/parser.ts` 的 `parseFormBlock`:先 `JSON.parse`;失败再 `repairJson` 后重试;仍失败则沿用原有 `formatJsonParseError`(对原文报错,不对修复后的文本报错)。
4. 成功修复时保留原始文本到 `rawJson`,不改变现有 `ParsedBlock` 形状。
5. 检查 `shared/form-fix.ts` / `server/auto-fix.ts`:修复成功的块不应再触发自动修复,补一个对应测试。
6. 更新 `shared/parser.test.ts`,把现有"坏 JSON"用例改为仍然无法修复的输入(如 e2e 的 `BADJSON` 带末尾逗号,修复后会变成合法,需要同步调整 `e2e/scenarios/scripts.mjs` 里的 `BADJSON` 并复查 S2)。
7. `npm run typecheck && npm test`。

**风险**:修复器把错误意图修成别的结构。缓解:只做语法级修复,并且必须过 zod。

## ② JSON 与标签式格式对比实验

**目标**:用数据决定要不要做标签式输入格式。

**说明**:e2e 里的 fake provider 是脚本化的,测不出真实模型的表现;这个实验必须用真实的 SWE-1.6,需要你确认可以消耗模型额度。

**步骤**
1. 在 `experiments/format-compare/` 下建独立脚本(不进 `files` 白名单,不发布,不进根 `tsconfig`)。
2. 准备约 10 条提示,覆盖简单表单、带选择、带表格/指标、带确认按钮。
3. 写标签式提示词变体(只用于实验,不改 `shared/prompt.ts`)和一个临时标签转 JSON 的转换器。
4. 用 paseo CLI 为每种格式各开 agent 跑同一批提示,每条重复 3 次。
5. 统计:首次解析成功率、经过宽容解析后的成功率、需要修复的次数、输出字符数。
6. 出一页对比报告(`experiments/format-compare/REPORT.md`)和结论:是否值得做标签式解析器。

**风险**:样本小,只作参考;不同模型结论可能不同。

## 顺序与验收

1. 先做 ①(独立、可测、可发版)。
2. ① 合入后再做 ②,这样实验里的 JSON 一组已经带宽容解析。
3. ① 验收:新增测试全绿,`typecheck` 通过,e2e S2 调整后仍通过。
4. ② 验收:报告产出并给出明确结论。
