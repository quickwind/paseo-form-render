import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const TIMELINE_KIND = "paseo-form-render";

/** Asks the daemon to put the demo form into an agent's timeline; nothing is sent to the agent. */
export const showDemoForm = defineRpc({
  name: "pfr-form.demo",
  input: z.object({ agentId: z.string() }),
  output: z.object({}),
});

export const DEMO_FORM_TEXT = [
  "Here is a demonstration of the interactive form:",
  "```pfr-form",
  JSON.stringify(
    {
      type: "Card",
      title: "Demo Configuration Form",
      description: "Try filling out this form and submitting it to the agent.",
      children: [
        { type: "Metric", label: "Current Version", value: "v0.1.0" },
        {
          type: "Input",
          id: "project_name",
          label: "Project Name",
          placeholder: "e.g., My Awesome Project",
          required: true,
        },
        {
          type: "Input",
          id: "project_desc",
          label: "Project Description",
          placeholder: "Enter details (vertically resizable)...",
          multiline: true,
        },
        {
          type: "Select",
          id: "environment",
          label: "Target Environment",
          options: [
            { label: "Development", value: "dev" },
            { label: "Staging", value: "staging" },
            { label: "Production", value: "prod" },
          ],
          defaultValue: "dev",
        },
        {
          type: "MultiSelect",
          id: "features",
          label: "Included Features",
          placeholder: "Select features to enable...",
          options: [
            { label: "Authentication (SSO)", value: "auth" },
            { label: "Metrics & Telemetry", value: "metrics" },
            { label: "Auto-backup to Cloud", value: "backup" },
            { label: "Email Notifications", value: "email" },
          ],
          defaultValue: ["auth", "metrics"],
        },
        {
          type: "FilePicker",
          id: "video_file",
          label: "Video File (.mp4)",
          placeholder: "Choose an MP4 video file or enter path...",
          pickerType: "file",
          extensions: ["mp4"],
          required: true,
        },
        {
          type: "FilePicker",
          id: "output_dir",
          label: "Output Directory",
          placeholder: "Choose output folder...",
          pickerType: "folder",
        },
        {
          type: "Toggle",
          id: "notify_team",
          label: "Send notification to team on completion",
          defaultValue: true,
        },
        {
          type: "Button",
          label: "Submit Configuration",
          variant: "primary",
          action: "submit",
          message: "Proceed with the submitted configuration.",
        },
      ],
    },
    null,
    2,
  ),
  "```",
].join("\n");
