import { stat } from "node:fs/promises";
import { relative as relativePath, resolve as resolvePath } from "node:path";
import {
  isCloudWorkerPlacementState,
  validateSessionsFilesOpenParams,
} from "../../../packages/gateway-protocol/src/index.js";
import { getAgentWorkspaceAccess } from "../../agents/workspace-access.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { resolveRequestedSessionAgentId } from "../session-request-agent.js";
import { readSessionWorkerPlacementAsync } from "../worker-environments/session-placement-lifecycle.js";
import {
  execOpenPath,
  formatOpenPathError,
  isHeadlessOpenPathError,
  resolveOpenPathCommand,
  resolveOpenWithAppCommand,
  sanitizePathForLog,
} from "./open-path.js";
import { decideSessionFileOpen } from "./session-file-open-policy.js";
import { rejectDeviceFolderFiles } from "./session-files-errors.js";
import { withSessionFileRoot } from "./session-files-root.js";
import type { RespondFn } from "./types.js";
import { defineValidatedGatewayHandler } from "./validation.js";

export function requireSessionFilesAgentId(params: {
  cfg: OpenClawConfig;
  sessionKey: string;
  agentId?: string;
  respond: RespondFn;
}): string | undefined {
  const requestedAgent = resolveRequestedSessionAgentId(
    params.cfg,
    params.sessionKey,
    params.agentId,
  );
  if (!requestedAgent.ok) {
    params.respond(false, undefined, requestedAgent.error);
    return undefined;
  }
  return requestedAgent.agentId;
}

/** Edit/view handoff of one session file to the Gateway host (never an execute action). */
export const sessionFileOpenHandler = defineValidatedGatewayHandler(
  "sessions.files.open",
  validateSessionsFilesOpenParams,
  async ({ params, respond, context }) => {
    const agentId = requireSessionFilesAgentId({
      cfg: context.getRuntimeConfig(),
      sessionKey: params.sessionKey,
      agentId: params.agentId,
      respond,
    });
    if (!agentId) {
      return;
    }
    return withSessionFileRoot(
      { sessionKey: params.sessionKey, agentId, getRuntimeConfig: context.getRuntimeConfig },
      context.getRuntimeConfig(),
      async (loaded, assertCurrent) => {
        if (rejectDeviceFolderFiles(loaded.entry, respond)) {
          return;
        }
        if (loaded.entry?.repositoryWorkspaceId) {
          respond(true, {
            ok: false,
            error:
              "This repository exists only on the cloud session runner. Use the Files panel to browse it; there is no Gateway checkout to open.",
          });
          return;
        }
        const workspaceRoot = loaded.root;
        if (!workspaceRoot) {
          respond(true, { ok: false, error: "No workspace root is available for this session." });
          return;
        }
        if (loaded.entry?.execNode || getAgentWorkspaceAccess(workspaceRoot)) {
          respond(true, {
            ok: false,
            error: loaded.entry?.execNode
              ? "Cannot open this file because the session runs on an exec node."
              : "Cannot open this file because its files live on a remote host.",
          });
          return;
        }
        const placement = await readSessionWorkerPlacementAsync({
          context,
          sessionId: loaded.entry?.sessionId,
        });
        if (isCloudWorkerPlacementState(placement?.state)) {
          respond(true, {
            ok: false,
            error: `Cannot open this file because the session runs remotely (${placement.state}).`,
          });
          return;
        }
        // Containment: the requested path must resolve inside the session file root,
        // the same boundary sessions.files.get enforces.
        const absPath = resolvePath(workspaceRoot, params.path);
        const rel = relativePath(workspaceRoot, absPath);
        if (rel === "" || rel.startsWith("..") || resolvePath(rel) === rel) {
          respond(true, {
            ok: false,
            error: "The requested file is outside this session's workspace.",
          });
          return;
        }
        let info;
        try {
          info = await stat(absPath);
        } catch {
          respond(true, { ok: false, path: absPath, error: "The file no longer exists." });
          return;
        }
        const decision = decideSessionFileOpen({
          name: absPath.split("/").pop() ?? absPath,
          isDirectory: info.isDirectory(),
          executable: (info.mode & 0o111) !== 0,
          config: context.getRuntimeConfig().gateway?.controlUi?.fileOpen,
        });
        if (decision.mode === "refuse") {
          respond(true, { ok: false, path: absPath, error: decision.reason });
          return;
        }
        const command =
          decision.mode === "editor"
            ? resolveOpenWithAppCommand(decision.app, absPath)
            : resolveOpenPathCommand(absPath);
        try {
          assertCurrent();
          await execOpenPath(command);
          assertCurrent();
          respond(true, { ok: true, path: absPath });
        } catch (error) {
          const errorMessage = formatOpenPathError(error);
          const detailedError = isHeadlessOpenPathError(error, command)
            ? `Cannot open file in headless environment. Path: ${absPath}. This environment appears to lack a graphical or terminal browser handler.`
            : `Failed to open file: ${errorMessage}`;
          context.logGateway.warn(
            `sessions.files.open failed path=${sanitizePathForLog(absPath)}: ${errorMessage}`,
          );
          respond(true, { ok: false, path: absPath, error: detailedError });
        }
      },
    );
  },
);
