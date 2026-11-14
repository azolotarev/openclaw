/**
 * Launch policy for the browser Control UI "Open" file action.
 *
 * The action is an edit/view handoff, never an execute action. Documents and
 * other inert content open through the OS default application; source/code
 * files open through an explicitly configured editor so an OS association that
 * happens to point at a terminal or interpreter cannot execute them. True
 * executables and shell/terminal scripts are always refused.
 */

export type SessionFileOpenPolicyConfig = {
  /** Application name used for source/code files (e.g. "Sublime Text"). */
  editor?: string;
  /** Extra extensions admitted to the OS default-app path. */
  allow?: string[];
  /** Extensions always refused (overrides allow). */
  deny?: string[];
};

export type SessionFileOpenDecision =
  | { mode: "default-app" }
  | { mode: "editor"; app: string }
  | { mode: "refuse"; reason: string };

/** Extensions that must never be handed to an OS association or launcher. */
const ALWAYS_REFUSED = new Set([
  "sh",
  "bash",
  "zsh",
  "fish",
  "command",
  "terminal",
  "webloc",
  "bat",
  "cmd",
  "exe",
  "com",
  "scr",
  "msi",
  "ps1",
  "psm1",
  "vbs",
  "vbe",
  "jse",
  "wsf",
  "wsh",
  "msc",
  "cpl",
  "hta",
  "app",
  "workflow",
  "action",
  "osax",
  "bundle",
  "plugin",
  "prefpane",
  "xpc",
  "framework",
  "dylib",
  "so",
  "dll",
  "jar",
]);

/** Source/code extensions routed to the explicit editor handoff. */
const SOURCE_EXTENSIONS = new Set([
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "py",
  "pyi",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "kts",
  "swift",
  "c",
  "h",
  "cpp",
  "cc",
  "cxx",
  "hpp",
  "cs",
  "php",
  "pl",
  "pm",
  "lua",
  "r",
  "scala",
  "sql",
  "vue",
  "svelte",
]);

/** Inert document/content extensions admitted to the OS default-app path. */
const DOCUMENT_EXTENSIONS = new Set([
  "md",
  "markdown",
  "mdx",
  "txt",
  "text",
  "log",
  "rst",
  "adoc",
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "tif",
  "tiff",
  "heic",
  "svg",
  "csv",
  "tsv",
  "json",
  "jsonc",
  "xml",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "env",
  "html",
  "htm",
  "rtf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "odp",
  "pages",
  "numbers",
  "key",
  "epub",
]);

function normalizeExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) {
    return "";
  }
  return name.slice(dot + 1).toLowerCase();
}

function normalizeList(values: string[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const value of values ?? []) {
    const trimmed = value.trim().toLowerCase().replace(/^\./, "");
    if (trimmed) {
      out.add(trimmed);
    }
  }
  return out;
}

export function decideSessionFileOpen(opts: {
  name: string;
  isDirectory: boolean;
  executable: boolean;
  config?: SessionFileOpenPolicyConfig;
}): SessionFileOpenDecision {
  if (opts.isDirectory) {
    return { mode: "refuse", reason: "Only files can be opened, not folders." };
  }
  const ext = normalizeExtension(opts.name);
  const deny = normalizeList(opts.config?.deny);
  const allow = normalizeList(opts.config?.allow);
  const editor = opts.config?.editor?.trim();

  if (deny.has(ext) || ALWAYS_REFUSED.has(ext)) {
    return {
      mode: "refuse",
      reason: "This file type is never opened from the Control UI because it can execute.",
    };
  }

  // Source/code files use the explicit editor handoff, never an OS association.
  if (SOURCE_EXTENSIONS.has(ext)) {
    if (editor) {
      return { mode: "editor", app: editor };
    }
    return {
      mode: "refuse",
      reason:
        'Set gateway.controlUi.fileOpen.editor to an editor app (e.g. "Sublime Text") to open source files.',
    };
  }

  // The executable bit blocks the default-app path even for otherwise-inert types.
  if (opts.executable) {
    return {
      mode: "refuse",
      reason: "Executable files are not opened from the Control UI.",
    };
  }

  if (DOCUMENT_EXTENSIONS.has(ext) || allow.has(ext)) {
    return { mode: "default-app" };
  }

  return {
    mode: "refuse",
    reason:
      "This file type is not in the default-app allowlist. Add it to gateway.controlUi.fileOpen.allow to open it.",
  };
}
