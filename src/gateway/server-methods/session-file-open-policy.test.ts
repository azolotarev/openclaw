import { describe, expect, it } from "vitest";
import { decideSessionFileOpen } from "./session-file-open-policy.js";

describe("decideSessionFileOpen", () => {
  it("opens documents via the OS default app", () => {
    for (const name of ["notes.md", "photo.png", "report.pdf", "data.toml", "page.html"]) {
      expect(decideSessionFileOpen({ name, isDirectory: false, executable: false })).toEqual({
        mode: "default-app",
      });
    }
  });

  it("routes source files to the configured editor, never the OS association", () => {
    expect(
      decideSessionFileOpen({
        name: "script.py",
        isDirectory: false,
        executable: false,
        config: { editor: "Sublime Text" },
      }),
    ).toEqual({ mode: "editor", app: "Sublime Text" });
  });

  it("refuses source files when no editor is configured", () => {
    const decision = decideSessionFileOpen({
      name: "script.py",
      isDirectory: false,
      executable: false,
    });
    expect(decision.mode).toBe("refuse");
  });

  it("always refuses executables and shell/terminal scripts", () => {
    for (const name of [
      "run.sh",
      "tool.command",
      "App.app",
      "setup.exe",
      "job.ps1",
      "link.webloc",
    ]) {
      expect(
        decideSessionFileOpen({
          name,
          isDirectory: false,
          executable: false,
          config: { editor: "X", allow: ["sh"] },
        }).mode,
      ).toBe("refuse");
    }
  });

  it("refuses the executable bit on the default-app path", () => {
    expect(
      decideSessionFileOpen({ name: "data.json", isDirectory: false, executable: true }).mode,
    ).toBe("refuse");
  });

  it("refuses directories", () => {
    expect(
      decideSessionFileOpen({ name: "folder", isDirectory: true, executable: false }).mode,
    ).toBe("refuse");
  });

  it("honors operator allow and deny overrides", () => {
    expect(
      decideSessionFileOpen({
        name: "custom.xyz",
        isDirectory: false,
        executable: false,
        config: { allow: ["xyz"] },
      }),
    ).toEqual({ mode: "default-app" });
    expect(
      decideSessionFileOpen({
        name: "notes.md",
        isDirectory: false,
        executable: false,
        config: { deny: ["md"] },
      }).mode,
    ).toBe("refuse");
  });

  it("refuses unknown types by default", () => {
    expect(
      decideSessionFileOpen({ name: "file.xyz", isDirectory: false, executable: false }).mode,
    ).toBe("refuse");
  });
});
