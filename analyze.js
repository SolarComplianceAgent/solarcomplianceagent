export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageBase64, mimeType, jobState, necEdition } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'No image provided' });
  }

  const GEMINI_KEY = AQ.Ab8RN6L23P7hfovE2rcJ30uLvkbF6_2wUV5UO798YKkLJN2Bag;

  if (!GEMINI_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const prompt = `You are a solar installation compliance inspector.
This installation is in ${jobState || 'California'} using ${necEdition || '2020 NEC'}.

Examine this photo and check for solar installation compliance issues.
Look specifically for:

1. DC conduit labels "WARNING: PHOTOVOLTAIC POWER SOURCE" every 10 feet
2. Rapid shutdown label (white text on red background)
3. Disconnect labeling showing electrical specs
4. System directory plaque at service panel
5. 36-inch roof access pathways (if roof visible)
6. Proper conduit installation and wiring
7. Equipment mounting and grounding

Respond ONLY with valid JSON — no markdown, no extra text:
{
  "overall": "PASS" or "NEEDS_ATTENTION" or "CANNOT_DETERMINE",
  "confidence": "HIGH" or "MEDIUM" or "LOW",
  "summary": "one plain English sentence for the installer",
  "findings": [
    {
      "status": "OK" or "MISSING" or "UNCLEAR",
      "item": "short item name",
      "detail": "what you see in plain English",
      "nec": "NEC section e.g. NEC 690.31(G)(3)",
      "checklist_id": 9
    }
  ]
}

checklist_id mapping:
1=roof pathways, 6=rapid shutdown device,
8=rapid shutdown label, 9=conduit labels,
10=markings at bends, 11=disconnect sign,
12=directory plaque, 17=backfed breaker label`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: mimeType || 'image/jpeg',
                  data: imageBase64
                }
              },
              { text: prompt }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1000
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Gemini API error');
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON from response
    let result;
    try {
      // Remove markdown if present
      const clean = text.replace(/```json\n?|\n?```/g, '').trim();
      result = JSON.parse(clean);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : null;
    }

    if (!result) {
      throw new Error('Could not parse AI response');
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('Gemini error:', error);
    return res.status(500).json({
      error: error.message,
      overall: 'CANNOT_DETERMINE',
      summary: 'Analysis failed. Please try again.',
      findings: []
    });
  }
}
