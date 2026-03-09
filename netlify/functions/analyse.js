export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("DEBUG: Gemini API Key is missing in process.env.");
    return { statusCode: 500, body: JSON.stringify({ error: "Gemini API key not configured on Netlify." }) };
  }

  try {
    const { fileBase64, mimeType, extraText } = JSON.parse(event.body);
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const prompt = `You are a clinical pharmacist and recovery specialist AI. 
CRITICAL: Scan EVERY SINGLE PAGE of this document. Do not miss any hidden sections or late-page medication lists.

Tasks:
1. Extract ALL medications listed.
2. Generate comprehensive, personalized recovery guidance based on the diagnosis, surgery, and specific patient details found.

Return ONLY a valid JSON object (no markdown, no explanation) in this exact format:
{
  "medications": [
    {
      "name": "Medication name",
      "dosage": "e.g. 500mg",
      "frequency": "e.g. Twice daily",
      "duration": "e.g. 5 days",
      "instructions": "e.g. Take after food",
      "reminderTimes": ["08:00", "20:00"] 
    }
  ],
  "recoveryGuidance": "Markdown formatted recovery advice including: Diet (specific to surgery), Hydration, Exercise limits, Wound care, and Warning signs."
}

Rules for Medications:
- Include tablets, injections, syrups, etc.
- Normalize frequency (BD -> Twice daily, etc.).
- Convert 'reminderTimes' to HH:mm (24h) if mentioned, otherwise provide logical defaults based on frequency.

Rules for Recovery Guidance:
- Use Markdown headers (###).
- Be specific to the surgery mentioned.

If no data is found, return empty fields.`;

    const body = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: fileBase64 } },
          { text: extraText ? `EXTRACTED TEXT FROM PDF:\n${extraText}\n\n${prompt}` : prompt }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
    };

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Gemini API error details (Analyse):", JSON.stringify(errorData, null, 2));
      return { statusCode: response.status, body: JSON.stringify({ error: errorData?.error?.message || "AI Analysis failed" }) };
    }

    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { statusCode: 500, body: JSON.stringify({ error: "Invalid AI response" }) };
    
    return { statusCode: 200, body: JSON.stringify(JSON.parse(jsonMatch[0])) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
