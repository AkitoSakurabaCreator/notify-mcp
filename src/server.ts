import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { notify } from "./notifier.js";
import { listSystemSounds, playSound } from "./sound.js";
import { safeErrorMessage } from "./errors.js";

const SERVER_NAME = "notify-mcp";
const SERVER_VERSION = "0.1.0";

const UrgencySchema = z.enum(["low", "normal", "critical"]);

export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.registerTool(
    "notify",
    {
      title: "Send Desktop Notification",
      description:
        "Send a desktop notification on macOS / Windows / Linux. Optional 'sound' supports 'system:NAME' or an absolute file path. Use list_sounds to enumerate available system sounds.",
      inputSchema: {
        title: z.string().min(1).max(256).describe("Notification title shown to the user."),
        message: z.string().min(1).max(4096).describe("Notification body."),
        urgency: UrgencySchema.optional().describe(
          "Linux only: notify-send urgency. Ignored on macOS/Windows.",
        ),
        sound: z
          .string()
          .min(1)
          .max(1024)
          .optional()
          .describe(
            'Optional sound. Use "system:NAME" for built-in sounds (see list_sounds) or an absolute file path.',
          ),
      },
    },
    async ({ title, message, urgency, sound }) => {
      try {
        const result = await notify({ title, message, urgency, sound });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.delivered,
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text",
              text: `notify failed: ${safeErrorMessage(e)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "list_sounds",
    {
      title: "List System Sounds",
      description:
        "List the built-in system sounds available for the current platform. Use the returned names with the 'system:NAME' sound spec.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = listSystemSounds();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `list_sounds failed: ${safeErrorMessage(e)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "play_sound",
    {
      title: "Play Sound",
      description:
        'Play a sound without sending a notification. Use "system:NAME" or an absolute file path.',
      inputSchema: {
        sound: z.string().min(1).max(1024).describe('"system:NAME" or absolute file path.'),
      },
    },
    async ({ sound }) => {
      try {
        const result = await playSound(sound);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: !result.played,
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `play_sound failed: ${safeErrorMessage(e)}` }],
          isError: true,
        };
      }
    },
  );

  return server;
}

export { SERVER_NAME, SERVER_VERSION };
