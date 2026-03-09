export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("DEBUG: Gemini API Key is missing in process.env. Keys available:", Object.keys(process.env).filter(k => k.includes("API") || k.includes("KEY")));
    return { statusCode: 500, body: JSON.stringify({ error: "Gemini API key not configured on Netlify. Please check your Environment Variables and RE-DEPLOY." }) };
  }

  try {
    const { fileBase64, mimeType, docType } = JSON.parse(event.body);
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const prompt = `You are an expert medical AI assistant. Analyze this ${docType} document.

Extract the medical information and return ONLY a valid JSON object in this exact format:
{
  "summary": "1-2 sentence medical summary of what this document is about.",
  "keyFindings": ["Finding 1", "Finding 2", "Finding 3"],
  "simplifiedExplanation": "A simple, patient-friendly explanation of what the results mean, avoiding overly complex medical jargon.",
  "medications": [
    {
      "name": "Medication name",
      "dosage": "e.g. 500mg",
      "frequency": "e.g. Twice daily / Once daily",
      "duration": "e.g. 5 days",
      "instructions": "e.g. Take after food"
    }
  ]
}

Rules:
- Include all medications found. If none, pass an empty array [].
- Return ONLY the JSON object, absolutely NO markdown formatting or other text.
- If it's hard to read, do your best to extract key points.`;

    const body = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: fileBase64 } },
          { text: prompt }
        ]
      }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
    };

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Gemini API error details (Analyse General):", JSON.stringify(errorData, null, 2));
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
