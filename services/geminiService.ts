import { GoogleGenAI, Type } from "@google/genai";
import { TravelStyle, Booking, Attraction } from "../types";

let apiKey = '';
let imageApiKey = '';
let ai: GoogleGenAI | null = null;
const IMAGE_API_URL = 'https://ai.juguang.chat/v1beta/models/gemini-2.5-flash-image:generateContent';
const imageInFlight = new Map<string, Promise<string | null>>();
const imageResultCache = new Map<string, string | null>();
const bingInFlight = new Map<string, Promise<string | null>>();
const bingResultCache = new Map<string, string | null>();

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return `h${Math.abs(hash)}`;
};

const getRequestKey = (prompt: string) => `guest-companion:image-requested:${hashString(prompt)}`;

export const setGeminiApiKey = (key: string) => {
  apiKey = key.trim();
  ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
};

export const setImageApiKey = (key: string) => {
  imageApiKey = key.trim();
};

const getClient = () => {
  return ai;
};

const extractImageFromResponse = (response: any): string | null => {
  const inlineData = response?.candidates?.[0]?.content?.parts?.find((part: any) => part.inlineData)?.inlineData;
  const imageBytes = inlineData?.data ? String(inlineData.data).replace(/\s+/g, '') : null;
  const mimeType = inlineData?.mimeType || 'image/png';
  if (imageBytes) {
    return `data:${mimeType};base64,${imageBytes}`;
  }

  const directUrl = response?.images?.[0]?.url || response?.data?.[0]?.url;
  if (directUrl) return directUrl;

  const directData = response?.images?.[0]?.data || response?.data?.[0]?.b64_json || response?.data?.[0];
  if (typeof directData === 'string') {
    const cleaned = directData.replace(/\s+/g, '');
    if (cleaned.startsWith('data:image/')) return cleaned;
    return `data:image/png;base64,${cleaned}`;
  }

  const part = response?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data || p?.fileData?.fileUri);
  if (part?.fileData?.fileUri) return part.fileData.fileUri;
  if (part?.inlineData?.data) {
    const partMime = part.inlineData.mimeType || 'image/png';
    return `data:${partMime};base64,${part.inlineData.data}`;
  }

  return null;
};

const generateImageFromPrompt = async (prompt: string, options?: { force?: boolean }): Promise<string | null> => {
  if (!imageApiKey) return null;
  const force = Boolean(options?.force);
  const cacheKey = prompt.trim();
  if (!force && imageResultCache.has(cacheKey)) {
    return imageResultCache.get(cacheKey) ?? null;
  }
  if (imageInFlight.has(cacheKey)) {
    return imageInFlight.get(cacheKey) ?? null;
  }
  if (!force && typeof sessionStorage !== 'undefined') {
    const requestKey = getRequestKey(cacheKey);
    if (sessionStorage.getItem(requestKey)) {
      return null;
    }
    sessionStorage.setItem(requestKey, '1');
  }

  const requestBody = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      topK: 20,
      topP: 0.8,
      maxOutputTokens: 1024
    }
  };

  const task = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(IMAGE_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${imageApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Image Gen Error:", response.status, errorText);
        return null;
      }

      const data = await response.json();
      return extractImageFromResponse(data);
    } catch (error) {
      console.error("Image Gen Error:", error);
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  })();

  imageInFlight.set(cacheKey, task);
  try {
    const result = await task;
    imageResultCache.set(cacheKey, result);
    return result;
  } finally {
    imageInFlight.delete(cacheKey);
  }
};

const fetchBingImage = async (query: string): Promise<string | null> => {
  const cacheKey = query.trim();
  if (bingResultCache.has(cacheKey)) {
    return bingResultCache.get(cacheKey) ?? null;
  }
  if (bingInFlight.has(cacheKey)) {
    return bingInFlight.get(cacheKey) ?? null;
  }

  const task = (async () => {
    try {
      const url = `https://r.jina.ai/http://www.bing.com/images/search?q=${encodeURIComponent(query)}&qft=+filterui:aspect-vertical`;
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      const html = await response.text();
      const decodeHtml = (value: string) => value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

      const turlMatch = html.match(/turl&quot;:&quot;([^&]+)&quot;/i) || html.match(/turl":"([^"]+)"/i);
      if (turlMatch?.[1]) {
        return decodeURIComponent(decodeHtml(turlMatch[1]));
      }

      const murlMatch = html.match(/murl&quot;:&quot;([^&]+)&quot;/i) || html.match(/murl":"([^"]+)"/i);
      if (murlMatch?.[1]) {
        return decodeURIComponent(decodeHtml(murlMatch[1]));
      }
      return null;
    } catch (error) {
      console.error('Bing image fetch failed:', error);
      return null;
    }
  })();

  bingInFlight.set(cacheKey, task);
  try {
    const result = await task;
    bingResultCache.set(cacheKey, result);
    return result;
  } finally {
    bingInFlight.delete(cacheKey);
  }
};

const fetchUnsplashImage = async (query: string): Promise<string | null> => {
  return `https://source.unsplash.com/featured/800x1200/?${encodeURIComponent(query)}`;
};

export const fetchFallbackImageForQuery = async (query: string): Promise<string | null> => {
  const bing = await fetchBingImage(query);
  if (bing) return bing;
  return fetchUnsplashImage(query);
};

export const generateConciergeInfo = async (
  attractionName: string,
  city: string,
  travelStyle: TravelStyle
): Promise<string> => {
  if (!apiKey) return "Please enter your Gemini API key to access AI insights.";

  try {
    const client = getClient();
    if (!client) return "Please enter your Gemini API key to access AI insights.";
    const prompt = `
      Act as a luxury hotel concierge. 
      Write a short, engaging 2-sentence cultural fact or tip about ${attractionName} in ${city}.
      Tailor the tone for a ${travelStyle} traveler.
    `;

    const response = await client.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "Information unavailable at the moment.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Our concierge service is momentarily unavailable.";
  }
};

export const generateSouvenirCaption = async (
  location: string,
  travelStyle: TravelStyle
): Promise<string> => {
  if (!apiKey) return "To travel is to live.";

  try {
    const client = getClient();
    if (!client) return "To travel is to live.";
    const prompt = `
      Generate a short, inspiring travel quote (max 10 words) for a postcard from ${location}.
      The vibe should be ${travelStyle}. 
      Do not include quotes or attribution, just the text.
    `;

    const response = await client.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text?.trim() || "Memories made here.";
  } catch (error) {
    return "A moment in time.";
  }
};

export const generatePostcardImage = async (
    hotelName: string,
    location: string,
    style: TravelStyle,
    force?: boolean
): Promise<string | null> => {
    if (!apiKey && !imageApiKey) {
        return fetchFallbackImageForQuery(`${hotelName} ${location}`);
    }

    try {
        const prompt = `
            A realistic travel photo taken at ${hotelName} in ${location}.
            Style: ${style} traveler vibe, warm natural lighting, candid moment, modern luxury atmosphere.
            Include details like lobby ambiance or a scenic hotel exterior with people in the background.
            Portrait orientation, vertical postcard format (4:6 aspect ratio).
            Photorealistic, high-end travel photography.
            No text, no illustration, no watermarks.
        `;

        const image = await generateImageFromPrompt(prompt, { force });
        if (image) return image;
        return await fetchFallbackImageForQuery(`${hotelName} ${location}`);
    } catch (error) {
        console.error("Postcard Gen Error:", error);
        return await fetchFallbackImageForQuery(`${hotelName} ${location}`);
    }
}

// "Nano Banana" - Avatar Generation
export const generateAvatar = async (style: TravelStyle): Promise<string | null> => {
    if (!apiKey) return null;

    try {
        const client = getClient();
        if (!client) return null;
        // Updated prompt for cleaner, brighter, preset-matching style
        const prompt = `
            Generate a 3D icon of a cute traveler avatar.
            Style: Pixar/Disney 3D animation style.
            Lighting: Bright studio lighting, soft shadows.
            Background: Plain white or very soft light gray background (clean).
            Character: ${style} traveler, friendly expression, vibrant colors.
            Composition: Centered headshot icon. 
            Do not include complex backgrounds or dark moody lighting.
        `;

        return await generateImageFromPrompt(prompt);
    } catch (error) {
        console.error("Avatar Gen Error:", error);
        return null;
    }
}

// "Nano Banana" - Attraction 3D Asset Generation
export const generateAttractionImage = async (type: string, name: string): Promise<string | null> => {
    if (!apiKey && !imageApiKey) {
        return fetchFallbackImageForQuery(`${name} ${type}`);
    }

    try {
        const client = getClient();
        if (!client) return null;
        const prompt = `
            Generate a cute 3D icon representing a ${type} (related to ${name}).
            Style: High-quality 3D render, toy-like, clay material, soft studio lighting, bright colors, isolated on plain white background.
            The object should look like a collectible miniature.
            If the type is generic, create a 3D map pin or location marker.
            Minimalist, single object.
        `;

        const image = await generateImageFromPrompt(prompt);
        if (image) return image;
        return await fetchFallbackImageForQuery(`${name} ${type}`);
    } catch (error) {
        console.error("Attraction Image Gen Error:", error);
        return await fetchFallbackImageForQuery(`${name} ${type}`);
    }
}

// NEW: Dynamic Attraction Generation (JSON)
export const generateDynamicAttractions = async (
    location: string,
    style: TravelStyle
): Promise<Attraction[]> => {
    if (!apiKey) return [];

    try {
        const client = getClient();
        if (!client) return [];
        const prompt = `
            Identify 3 "Nearby" hidden gems/activities and 3 "Must-See" famous landmarks in ${location}.
            Target Audience: ${style} traveler.
            Return a JSON object with a list of attractions.
            For 'icon', suggest a valid Material Symbol name (snake_case) that represents the place (e.g. 'restaurant', 'park', 'museum', 'photo_camera').
        `;

        const response = await client.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        attractions: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING },
                                    type: { type: Type.STRING, description: "Short type e.g. Cafe, Park, Temple" },
                                    category: { type: Type.STRING, enum: ["Nearby", "Must-See"] },
                                    description: { type: Type.STRING, description: "Short engaging description, max 10 words" },
                                    icon: { type: Type.STRING, description: "Material Symbol name" }
                                }
                            }
                        }
                    }
                }
            }
        });

        const json = JSON.parse(response.text || "{}");
        const list = json.attractions || [];

        // Map to internal Attraction interface
        return list.map((item: any, index: number) => ({
            id: 9000 + index + Math.floor(Math.random() * 1000), // Random ID to avoid collision
            name: item.name,
            type: item.type,
            category: item.category,
            icon: item.icon || 'place',
            description: item.description,
            coordinates: { top: '50%', left: '50%' }, // Dummy coordinates as we use iframe maps
            imageUrl: '' // Will be generated separately
        }));

    } catch (error) {
        console.error("Dynamic Attraction Gen Error:", error);
        return [];
    }
}

export const chatWithConcierge = async (
    message: string, 
    history: {role: string, parts: {text: string}[]}[],
    context: string
) => {
    if (!apiKey) return "System offline.";

    try {
        const client = getClient();
        if (!client) return "System offline.";
        const chat = client.chats.create({
            model: 'gemini-3-flash-preview',
            history: history,
            config: {
                systemInstruction: `You are a helpful, sophisticated hotel concierge at ${context}. Keep answers brief (under 50 words) and helpful.`
            }
        });

        const result = await chat.sendMessage({ message });
        return result.text;
    } catch (error) {
        console.error("Chat Error", error);
        return "I am having trouble connecting to the concierge network.";
    }
}

export const generateItinerary = async (
    booking: Booking,
    style: TravelStyle
): Promise<string> => {
    if (!apiKey) return "Itinerary generation offline.";

    try {
        const client = getClient();
        if (!client) return "Itinerary generation offline.";
        const prompt = `
            Create a brief, daily itinerary for a trip to ${booking.location}.
            Traveler Style: ${style}.
            Dates: ${booking.checkInDate} to ${booking.checkOutDate}.
            Format: Markdown, bullet points.
            Focus: Provide a "Theme of the Day" and 2 key activities per day.
            Keep it concise and exciting.
        `;

        const response = await client.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });

        return response.text || "Could not generate itinerary.";
    } catch (error) {
        return "Itinerary service momentarily unavailable.";
    }
}
