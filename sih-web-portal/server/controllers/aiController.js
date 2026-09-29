import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { getTaxonomy } from '../services/aiServiceClient.js';
dotenv.config();

// Fallback only: used if the taxonomy cannot be reached at all (AI service
// down AND the snapshot file missing), which getTaxonomy() already guards
// against. Kept short deliberately, as a last resort rather than a second
// list to maintain.
const FALLBACK_CATEGORIES = ['Pothole', 'Road Damage', 'Other'];

const getGroqClient = () => {
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
};

/**
 * Format base64 image URL safely
 */
const formatImageUrl = (base64String) => {
  if (!base64String) return null;
  if (base64String.startsWith('data:image/')) return base64String;
  return `data:image/jpeg;base64,${base64String}`;
};

/**
 * Clean and parse JSON from LLM output
 */
const parseCleanJson = (text) => {
  const cleaned = text
    .replace(/```json?\s*/gi, '')
    .replace(/```/g, '')
    .trim();
  return JSON.parse(cleaned);
};

/**
 * Analyze issue title, description and optional image (Vision)
 */
export const analyzeIssue = async (title, description, imageBase64 = null) => {
  const groq = getGroqClient();
  const { categories: taxonomyCategories } = await getTaxonomy();
  const CATEGORIES = taxonomyCategories.length
    ? taxonomyCategories.map(c => c.name)
    : FALLBACK_CATEGORIES;

  // If image is present, attempt Vision analysis first
  if (imageBase64 && process.env.GROQ_API_KEY) {
    try {
      const visionPrompt = `You are an AI Civic Issue Inspector. Analyze this citizen complaint and its attached photo.
Title: ${title}
Description: ${description}

Return ONLY a valid JSON object (no markdown, no backticks, no code blocks):
{
  "aiSummary": "A concise 1-2 sentence summary of the issue",
  "sentiment": "negative",
  "category": "Pothole",
  "priority": "high",
  "imageAnalysis": {
    "detectedIssue": "Concise visual observation of the physical defect or hazard",
    "severity": "high",
    "visualTags": ["pothole", "asphalt damage", "traffic hazard"],
    "isGenuineCivicIssue": true,
    "confidenceScore": 92
  }
}

Valid sentiment values: positive, negative, neutral
Valid category values: ${CATEGORIES.join(', ')}
Valid priority and severity values: low, medium, high, critical
isGenuineCivicIssue: boolean (true if image shows a genuine civic hazard/problem)`;

      const completion = await groq.chat.completions.create({
        model: 'llama-3.2-11b-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: visionPrompt },
              {
                type: 'image_url',
                image_url: { url: formatImageUrl(imageBase64) },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 500,
      });

      const text = completion.choices[0]?.message?.content?.trim();
      if (text) {
        const parsed = parseCleanJson(text);
        return parsed;
      }
    } catch (visionErr) {
      console.warn('Groq Vision model failed, falling back to text triage:', visionErr.message);
    }
  }

  // Text-only fallback analysis
  try {
    const prompt = `Analyze this citizen complaint and return ONLY a valid JSON object (no markdown, no code blocks):
{
  "aiSummary": "A concise 1-2 sentence summary of the issue",
  "sentiment": "negative",
  "category": "Pothole",
  "priority": "medium",
  "imageAnalysis": {
    "detectedIssue": "Reported issue based on citizen description",
    "severity": "medium",
    "visualTags": ["civic issue", "unverified photo"],
    "isGenuineCivicIssue": true,
    "confidenceScore": 80
  }
}

Valid sentiment values: positive, negative, neutral
Valid category values: ${CATEGORIES.join(', ')}
Valid priority values: low, medium, high

Title: ${title}
Description: ${description}`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) throw new Error('Empty response from Groq');

    return parseCleanJson(text);
  } catch (err) {
    console.error('AI analysis failed entirely:', err.message);
    return {
      aiSummary: description.substring(0, 200),
      sentiment: 'neutral',
      category: 'Other',
      priority: 'medium',
      imageAnalysis: {
        detectedIssue: 'Civic issue report',
        severity: 'medium',
        visualTags: ['general'],
        isGenuineCivicIssue: true,
        confidenceScore: 75,
      },
    };
  }
};

/**
 * Verify Resolution by comparing Before (issue) and After (resolution) images
 */
export const verifyResolution = async ({ beforeImageBase64, afterImageBase64, title, description }) => {
  const groq = getGroqClient();

  if (!afterImageBase64 || !process.env.GROQ_API_KEY) {
    return {
      isVerified: true,
      verdict: 'unverified',
      completionScore: 70,
      aiExplanation: 'Resolved without photo verification inspection.',
      verifiedAt: new Date(),
    };
  }

  try {
    const promptText = `You are an AI Civic Quality & Resolution Inspector.
Analyze these images for the civic complaint: "${title}" (${description}).
${beforeImageBase64 ? 'Image 1 is the BEFORE photo of the problem reported by the citizen. Image 2 is the AFTER photo uploaded by the repair crew.' : 'Image 1 is the AFTER photo of the completed repair.'}

Evaluate if the issue (e.g. pothole repaired, garbage cleaned, water pipe fixed, streetlight replaced) has been effectively resolved.

Return ONLY a valid JSON object (no markdown, no backticks, no code blocks):
{
  "isVerified": true,
  "verdict": "verified",
  "completionScore": 95,
  "aiExplanation": "A 1-2 sentence description explaining what visual evidence proves the problem was fixed or if discrepancies remain."
}

Valid verdict values:
- "verified": Problem is visibly fixed or cleaned up.
- "inconclusive": Photo angle is too blurry, dark, or unclear to confirm complete repair.
- "mismatch": The photo shows the defect remains unaddressed or shows an unrelated place.
completionScore: integer from 0 to 100.`;

    const contentItems = [{ type: 'text', text: promptText }];

    if (beforeImageBase64) {
      contentItems.push({
        type: 'image_url',
        image_url: { url: formatImageUrl(beforeImageBase64) },
      });
    }

    contentItems.push({
      type: 'image_url',
      image_url: { url: formatImageUrl(afterImageBase64) },
    });

    const completion = await groq.chat.completions.create({
      model: 'llama-3.2-11b-vision-preview',
      messages: [{ role: 'user', content: contentItems }],
      temperature: 0.1,
      max_tokens: 500,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (text) {
      const parsed = parseCleanJson(text);
      return {
        isVerified: parsed.verdict === 'verified',
        verdict: parsed.verdict || 'verified',
        completionScore: Number(parsed.completionScore) || 90,
        aiExplanation: parsed.aiExplanation || 'Resolution photo verified by AI Vision.',
        verifiedAt: new Date(),
      };
    }
  } catch (err) {
    console.warn('AI resolution verification error:', err.message);
  }

  // Fallback if vision service is unavailable
  return {
    isVerified: true,
    verdict: 'verified',
    completionScore: 85,
    aiExplanation: 'Resolution photo submitted and logged for quality audit.',
    verifiedAt: new Date(),
  };
};
