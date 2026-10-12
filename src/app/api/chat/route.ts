import { clientFrom, errorResponse, structured } from "@/lib/ai";
import { sourceToPrompt, type VideoSource } from "@/lib/youtube";

export const maxDuration = 60;

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["message", "options", "multiSelect", "ready", "dish"],
  properties: {
    message: { type: "string", description: "Your reply. One or two short sentences, warm and plain." },
    options: { type: "array", items: { type: "string" }, description: "2-6 short tap-to-answer replies (max 4 words each). Empty when ready." },
    multiSelect: { type: "boolean", description: "True if the user may pick several options." },
    ready: { type: "boolean", description: "True when you have enough to write the recipe." },
    dish: { type: "string", description: "The dish name you've understood so far, or empty." },
  },
};

const INSTRUCTIONS = `You are the kitchen assistant inside Adukala, an app that turns a dish idea or a YouTube recipe video into measured, step-by-step instructions for someone who has never cooked.

Your job right now is a short interview before the recipe is written. Ask ONE question per turn, with tap-able options. Ask at most 3 questions in the whole conversation, then set ready=true.

Pick the most useful questions, in roughly this priority:
1. How many people they're cooking for (options like "1", "2", "3–4", "5–6") — skip if already known.
2. How they like it: options like "As in the video", "Less oil", "High protein", "Less spicy", "Kid friendly", "Jain (no onion/garlic)" — multiSelect true.
3. Only if the source needs equipment they may not have (oven, air fryer, blender, idli steamer...), ask what they have and offer the pressure cooker / kadai / mixer alternative. Or, if an ingredient is unusual, ask whether they have it and offer a common swap.

Scope: Adukala only does North and South Indian home cooking. If the request is clearly outside that, say so kindly and suggest the closest Indian dish as an option.

When a video is provided, refer to it naturally (e.g. "Nice — Hebbar's tiffin sambar."). If the transcript and description have little recipe detail, say you'll fill in standard measurements.

When ready=true, the message should be one line like "Perfect — writing your measured steps now." and options must be empty. Set ready=true immediately if the user says to just make it.`;

export async function POST(req: Request) {
  try {
    const ai = clientFrom(req);
    const { messages, video } = (await req.json()) as { messages: Turn[]; video?: VideoSource | null };
    const transcript = messages.map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`).join("\n");
    const asked = messages.filter((m) => m.role === "assistant").length;
    const input = [
      video ? `SOURCE\n${sourceToPrompt({ ...video, transcript: video.transcript?.slice(0, 6000) })}` : "SOURCE: none (the user is describing a dish).",
      `CONVERSATION SO FAR (you have asked ${asked} question${asked === 1 ? "" : "s"}):\n${transcript}`,
      asked >= 3 ? "You have asked enough. Set ready=true now." : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const out = await structured<{ message: string; options: string[]; multiSelect: boolean; ready: boolean; dish: string }>({
      ai,
      instructions: INSTRUCTIONS,
      input,
      schema: SCHEMA,
      name: "interview_turn",
      effort: "low",
    });
    return Response.json(out);
  } catch (e) {
    return errorResponse(e);
  }
}
