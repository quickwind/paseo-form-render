import { defineTranslations } from "@getpaseo/plugin/client";

/**
 * Labels shown in the plugin UI. English is the source of truth; every other locale must use the
 * same keys and placeholders (checked by the SDK and by `client/messages.test.ts`). The host picks the
 * locale from the app language.
 */
const en = {
  slash: {
    form: "Instruct the agent to use pfr-form protocol",
    formDemo: "Show a demo interactive form",
  },
  errorBox: {
    title: "[pfr-form Syntax Error]",
    askFix: "Ask agent to fix",
    sending: "Sending…",
    fixRequested: "✓ Fix requested; the agent will reply with a corrected form",
  },
  form: {
    submitted: "✓ Form Submitted",
  },
  dropdown: {
    placeholder: "Select an option...",
    multiPlaceholder: "Select options...",
    close: "Close dropdown menu",
  },
  file: {
    folderPlaceholder: "Enter or select folder...",
    filePlaceholder: "Enter or select file...",
    browse: "Browse...",
    fullPath: "Full path:",
  },
  picker: {
    selectFolder: "Select Folder",
    selectFile: "Select File",
    chooseFolder: "Choose Folder",
    chooseFile: "Choose File",
    quick: "Quick:",
    searchPlaceholder: "Search files/folders in directory...",
    newFolderPlaceholder: "New folder name...",
    create: "Create",
    upToParent: ".. (Up to parent)",
    loading: "Loading files...",
    noMatches: "No matching entries found",
    selected: "✓ Selected",
    selectedLabel: "Selected:",
    cancel: "Cancel",
    projectRoot: "Project Root",
    project: "Project",
    invalidFolderName: 'Folder name contains invalid characters (/ \\ : * ? " < > |).',
    createFailed: "Failed to create folder.",
  },
  settings: {
    loadError: "Could not load settings: {{error}}",
    retry: "Retry",
    resetDefaults: "Reset to defaults",
    autoFixTitle: "Automatic form fixes",
    autoFixDescription:
      'When an agent replies with a pfr-form block that fails validation, ask it to re-send a corrected block automatically. This sets how many times in a row the agent is asked; 0 turns automatic fixes off. The "Ask agent to fix" button on an error box always works.',
    maxRetries: "Maximum retries",
    decreaseRetries: "Decrease retries",
    increaseRetries: "Increase retries",
    hintOff: "Automatic fixes are off.",
    hint_one: "Up to {{count}} automatic request per reply.",
    hint_other: "Up to {{count}} automatic requests per reply.",
    saving: "Saving…",
    preferFormsTitle: "Prefer forms",
    preferFormsDescription:
      "By default the agent is only told it can use pfr-form. Turn this on to require it to ask for choices, parameters, and confirmations with a form instead of plain text. Applies to agents created after the change.",
    requireForms: "Require forms for user input",
    saveError: "Could not save: {{error}}",
  },
};

const zhCN = {
  slash: {
    form: "让智能体使用 pfr-form 协议",
    formDemo: "显示一个交互表单示例",
  },
  errorBox: {
    title: "[pfr-form 语法错误]",
    askFix: "请求智能体修复",
    sending: "发送中…",
    fixRequested: "✓ 已请求修复，智能体将回复更正后的表单",
  },
  form: {
    submitted: "✓ 表单已提交",
  },
  dropdown: {
    placeholder: "请选择...",
    multiPlaceholder: "请选择多项...",
    close: "关闭下拉菜单",
  },
  file: {
    folderPlaceholder: "输入或选择文件夹...",
    filePlaceholder: "输入或选择文件...",
    browse: "浏览...",
    fullPath: "完整路径：",
  },
  picker: {
    selectFolder: "选择文件夹",
    selectFile: "选择文件",
    chooseFolder: "选择此文件夹",
    chooseFile: "选择此文件",
    quick: "快捷：",
    searchPlaceholder: "在目录中搜索文件/文件夹...",
    newFolderPlaceholder: "新文件夹名称...",
    create: "创建",
    upToParent: ".. (返回上级)",
    loading: "正在加载文件...",
    noMatches: "没有匹配的条目",
    selected: "✓ 已选择",
    selectedLabel: "已选择：",
    cancel: "取消",
    projectRoot: "项目根目录",
    project: "项目",
    invalidFolderName: '文件夹名称包含非法字符 (/ \\ : * ? " < > |)。',
    createFailed: "创建文件夹失败。",
  },
  settings: {
    loadError: "无法加载设置：{{error}}",
    retry: "重试",
    resetDefaults: "恢复默认值",
    autoFixTitle: "自动修复表单",
    autoFixDescription:
      "当智能体回复的 pfr-form 代码块未通过校验时，自动请求它重新发送更正后的代码块。此处设置连续请求的最多次数；设为 0 则关闭自动修复。错误框上的“请求智能体修复”按钮始终可用。",
    maxRetries: "最大重试次数",
    decreaseRetries: "减少重试次数",
    increaseRetries: "增加重试次数",
    hintOff: "自动修复已关闭。",
    hint_other: "每条回复最多自动请求 {{count}} 次。",
    saving: "保存中…",
    preferFormsTitle: "优先使用表单",
    preferFormsDescription:
      "默认情况下，智能体只被告知可以使用 pfr-form。开启后，它必须通过表单询问选项、参数和确认，而不是纯文本。仅对之后创建的智能体生效。",
    requireForms: "用户输入必须使用表单",
    saveError: "无法保存：{{error}}",
  },
};

export const messages = defineTranslations({
  resources: {
    en,
    "zh-CN": zhCN,
    zh: zhCN,
  },
});
