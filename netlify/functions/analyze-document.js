export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("DEBUG: Gemini API Key is missing in process.env.");
    return { statusCode: 500, body: JSON.stringify({ error: "Gemini API key not configured on the server. Please check your Environment Variables." }) };
  }

  try {
    const { text, fileBase64, mimeType } = JSON.parse(event.body);

    if (!text && !fileBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: "No document content provided." }) };
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const prompt = `You are a world-class AI medical document analyzer. Analyze the provided clinical document and extract the following structured medical insights.

Return ONLY a valid JSON object in this EXACT format (no markdown, no extra text):
{
  "diagnosis": "The primary diagnosis or condition identified.",
  "medications": [
    {
      "name": "Medication name",
      "dosage": "e.g. 500mg",
      "frequency": "e.g. Twice daily",
      "duration": "e.g. 5 days",
      "instructions": "e.g. Take after food"
    }
  ],
  "labResults": "Summary of key lab results or 'No relevant lab results found.'",
  "doctorRecommendations": "What the doctor recommended or 'None provided.'",
  "dietInstructions": "Any strict diet or food instructions requested or 'None provided.'",
  "warningSigns": "Any warning signs to look out for or 'None provided.'"
}

Extract the most accurate data possible based on the text provided.`;

    // Support both pre-extracted text (PDF) and raw images (fallback)
    const contentParts = [];
    if (text) {
      contentParts.push({ text: `EXTRACTED DOCUMENT TEXT:\n${text}\n\n${prompt}` });
    } else if (fileBase64 && mimeType) {
      contentParts.push({ inline_data: { mime_type: mimeType, data: fileBase64 } });
      contentParts.push({ text: prompt });
    }

    const body = {
      contents: [{ parts: contentParts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
    };

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { 
        statusCode: response.status, 
        body: JSON.stringify({ error: errorData?.error?.message || "Google's AI service is currently unavailable. Please try again later." }) 
      };
    }

    const result = await response.json();
    const resultText = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      return { statusCode: 500, body: JSON.stringify({ error: "The AI was unable to structure the analysis properly. Please ensure the document is clear." }) };
    }
    
    return { statusCode: 200, body: JSON.stringify(JSON.parse(jsonMatch[0])) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "An unexpected error occurred during analysis: " + err.message }) };
  }
};
