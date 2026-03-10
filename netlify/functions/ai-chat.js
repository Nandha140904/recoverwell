export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("DEBUG: Groq API Key is missing in process.env.");
    return { statusCode: 500, body: JSON.stringify({ error: "Groq API key not configured on the server. Please check your Environment Variables." }) };
  }

  try {
    const body = JSON.parse(event.body);

    const groqUrl = "https://api.groq.com/openai/v1/chat/completions";

    const response = await fetch(groqUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Groq API error:", JSON.stringify(errorData));
      return { 
        statusCode: response.status, 
        body: JSON.stringify({ error: errorData?.error?.message || "Groq's AI service is currently unavailable. Please try again later." }) 
      };
    }

    const result = await response.json();
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    console.error("ai-chat function error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "An unexpected error occurred during analysis: " + err.message }) };
  }
};
