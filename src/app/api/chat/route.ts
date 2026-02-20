import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set in .env.local");
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { messages, system, max_tokens, fast } = body;

    const defaultModel = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
    const model = fast ? "claude-haiku-4-5-20251001" : defaultModel;
    // Cap max_tokens — chatbot=256, summaries can be higher
    const tokens = Math.min(max_tokens || 256, 1500);

    console.log(`[Chat API] Sending request with ${messages.length} messages, model: ${model}, max_tokens: ${tokens}`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: tokens,
        system: system || "",
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Chat API] Anthropic error ${response.status}:`, errText);
      return NextResponse.json({ error: `AI service error: ${response.status}`, details: errText }, { status: 502 });
    }

    const data = await response.json();
    const text = data.content
      ?.filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("") || "";

    console.log(`[Chat API] Success, response length: ${text.length}`);
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[Chat API] Error:", err);
    return NextResponse.json({ error: "Internal server error", details: String(err) }, { status: 500 });
  }
}