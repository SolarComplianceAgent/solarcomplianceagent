const fetch = (...args) =>
  import('node-fetch').then(({default: f}) => f(...args));

module.exports = async function handler(req, res) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageBase64, mimeType, jobState, necEdition } = req.body;
  const GEMINI_KEY = AQ.Ab8RN6L23P7hfovE2rcJ30uLvkbF6_2wUV5UO798YKkLJN2Bag;

  if (!GEMINI_KEY) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY not set in Vercel environment variables'
    });
  }

  const prompt = `You are a solar installation NEC compliance inspector.
This installation is in ${jobState || 'California'} using ${necEdition || '2020 NEC'}.

Inspect this photo and check for:
1. DC conduit labels WARNING PHOTOVOLTAIC POWER SOURCE every 10 feet
2. Rapid shutdown label white text on red background
3. Disconnect sign showing electrical specs
4. System directory plaque at panel
5. Roof access pathways 36 inches wide if visible
6. Proper wiring and equipment mounting

Respond ONLY with valid JSON no markdown no extra text:
{
  "overall": "NEEDS_ATTENTION",
  "confidence": "MEDIUM",
  "summary": "plain English summary",
  "findings": [
    {
      "status": "MISSING",
      "item": "DC Conduit Labels",
      "detail": "No WARNING labels visible on conduit",
      "nec": "NEC 690.31(G)(3)",
      "checklist_id": 9
    }
  ]
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
              { text: prompt }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1000 }
        })
      }
    );

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    text = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1) throw new Error('No JSON in response');
    const result = JSON.parse(text.substring(start, end + 1));
    return res.status(200).json(result);

  } catch (error) {
    return res.status(500).json({
      overall: 'CANNOT_DETERMINE',
      confidence: 'LOW',
      summary: 'Analysis failed: ' + error.message,
      findings: []
    });
  }
};
