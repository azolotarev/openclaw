/* @vitest-environment jsdom */

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { registerChatSessionOptionalEnglish } from "../../../i18n/locales/en-chat-session-optional.ts";
import {
  createWorkspace,
  file,
  mountWorkspace,
  setupDesktopLayout,
} from "./chat-session-workspace-rail.test-support.ts";

registerChatSessionOptionalEnglish();

beforeEach(setupDesktopLayout);
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it("renders an Open action per file row and hands the path to the Gateway", async () => {
  const onOpenInApp = vi.fn();
  const workspace = createWorkspace({
    onOpenInApp,
    list: { root: "/workspace", files: [file("notes.md"), file("script.py")] },
  });
  const view = await mountWorkspace(workspace);
  const open = view.container.querySelector<HTMLButtonElement>('button[aria-label="Open"]');
  expect(open).toBeTruthy();
  expect(view.container.querySelector('button[aria-label="Preview"]')).toBeTruthy();

  open!.click();
  expect(onOpenInApp).toHaveBeenCalledWith(expect.stringContaining("notes.md"));
});

it("hides Open when the owner does not provide an open handler", async () => {
  const workspace = createWorkspace({
    list: { root: "/workspace", files: [file("notes.md")] },
  });
  const view = await mountWorkspace(workspace);
  expect(view.container.querySelector('button[aria-label="Open"]')).toBeNull();
});
