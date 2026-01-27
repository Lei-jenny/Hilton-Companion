import { TravelStyle, Booking, Attraction } from "../types";

let apiKey = process.env.API_KEY || '';

const getStoredKey = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('GEMINI_API_KEY') || '';
};

const initKey = () => {
    const stored = getStoredKey();
    if (stored) {
        apiKey = stored;
    }
};

initKey();

const GEMINI_BASE_URL = 'https://ai.juguang.chat/v1beta/models';
const CACHE_PREFIX = 'gemini-cache:';

const isBrowser = () => typeof window !== 'undefined';

const toBase64 = (value: string) => {
    if (!isBrowser() || typeof btoa === 'undefined') return value;
    try {
        return btoa(unescape(encodeURIComponent(value)));
    } catch {
        return value;
    }
};

const buildCacheKey = (type: string, model: string, prompt: string) => {
    const raw = `${type}|${model}|${prompt}`;
    return `${CACHE_PREFIX}${toBase64(raw)}`;
};

const readCache = <T>(key: string): T | null => {
    if (!isBrowser()) return null;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.value ?? null;
    } catch {
        return null;
    }
};

const writeCache = <T>(key: string, value: T) => {
    if (!isBrowser()) return;
    try {
        localStorage.setItem(key, JSON.stringify({ value, ts: Date.now() }));
    } catch {
        // ignore cache write failures
    }
};

export const clearGeminiCache = () => {
    if (!isBrowser()) return;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CACHE_PREFIX)) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
};

const buildTextRequest = (prompt: string, maxOutputTokens = 1024) => ({
    contents: [
        {
            parts: [{ text: prompt }]
        }
    ],
    generationConfig: {
        temperature: 0.7,
        topK: 20,
        topP: 0.8,
        maxOutputTokens
    }
});

const buildImageRequest = (prompt: string, maxOutputTokens = 256) => ({
    contents: [
        {
            parts: [{ text: prompt }]
        }
    ],
    generationConfig: {
        temperature: 0.7,
        topK: 20,
        topP: 0.8,
        maxOutputTokens
    },
    safetySettings: [
        {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
        }
    ]
});

const buildChatRequest = (
    history: { role: string; parts: { text: string }[] }[],
    message: string
) => ({
    contents: [
        ...history.map((item) => ({
            role: item.role,
            parts: item.parts
        })),
        {
            role: 'user',
            parts: [{ text: message }]
        }
    ],
    generationConfig: {
        temperature: 0.6,
        topK: 20,
        topP: 0.8,
        maxOutputTokens: 1024
    }
});

const fetchGemini = async (
    model: string,
    body: unknown,
    options?: {
        maxAttempts?: number;
        timeoutMs?: number;
        retryDelayMs?: number;
    }
) => {
    const maxAttempts = options?.maxAttempts ?? 2;
    const timeoutMs = options?.timeoutMs ?? 30000;
    const retryDelayMs = options?.retryDelayMs ?? 800;
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= maxAttempts) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            const response = await fetch(`${GEMINI_BASE_URL}/${model}:generateContent`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                // Retry once on rate limits
                if (response.status === 429 && attempt < maxAttempts) {
                    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
                    attempt += 1;
                    continue;
                }
                throw new Error(`Gemini API error ${response.status}: ${errorText}`);
            }

            return response.json();
        } catch (error: any) {
            lastError = error;
            if (attempt >= maxAttempts) break;
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
            attempt += 1;
        }
    }

    throw lastError || new Error('Gemini API request failed.');
};

const extractText = (response: any) =>
    response?.candidates?.[0]?.content?.parts?.[0]?.text || '';

const extractImageUrl = (response: any) => {
    // Preferred inlineData
    const parts = response?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
        if (part?.inlineData?.data) {
            const mimeType = part.inlineData.mimeType || 'image/png';
            return `data:${mimeType};base64,${part.inlineData.data}`;
        }
    }

    // Alternate response shapes seen in other endpoints
    if (response?.image?.url) return response.image.url;
    if (Array.isArray(response?.images) && response.images.length > 0) {
        return response.images[0]?.url || response.images[0];
    }
    if (Array.isArray(response?.data) && response.data.length > 0) {
        return response.data[0]?.url || response.data[0];
    }

    return null;
};

const fetchImageWithFallback = async (
    model: string,
    prompt: string,
    fastTokens: number,
    slowTokens: number
) => {
    // Fast attempt first
    const fastResponse = await fetchGemini(
        model,
        buildImageRequest(prompt, fastTokens),
        { maxAttempts: 0, timeoutMs: 20000 }
    );
    const fastImage = extractImageUrl(fastResponse);
    if (fastImage) return fastImage;

    // Fallback with higher token budget (more reliable)
    const slowResponse = await fetchGemini(
        model,
        buildImageRequest(prompt, slowTokens),
        { maxAttempts: 0, timeoutMs: 30000 }
    );
    return extractImageUrl(slowResponse);
};

const buildPlaceholderDataUrl = (label: string) => {
    const safeLabel = label.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
          <defs>
            <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#ffffff"/>
              <stop offset="100%" stop-color="#f1f5f9"/>
            </linearGradient>
          </defs>
          <rect width="512" height="512" rx="72" fill="url(#bg)"/>
          <rect x="56" y="56" width="400" height="400" rx="56" fill="#ffffff" stroke="#e2e8f0" stroke-width="8"/>
          <text x="256" y="250" text-anchor="middle" font-family="Manrope, Arial, sans-serif" font-size="20" fill="#64748b">
            Generating
          </text>
          <text x="256" y="285" text-anchor="middle" font-family="Manrope, Arial, sans-serif" font-size="16" fill="#94a3b8">
            ${safeLabel}
          </text>
        </svg>
    `;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export const getAttractionPlaceholder = (type: string, name: string) =>
    buildPlaceholderDataUrl(`${name}`);

export const setApiKey = (key: string) => {
    apiKey = key.trim();
    if (typeof window !== 'undefined') {
        if (apiKey) {
            localStorage.setItem('GEMINI_API_KEY', apiKey);
        } else {
            localStorage.removeItem('GEMINI_API_KEY');
        }
    }
};

export const generateConciergeInfo = async (
  attractionName: string,
  city: string,
  travelStyle: TravelStyle,
  forceRefresh = false
): Promise<string> => {
  if (!apiKey) return "Please configure your API Key to access AI insights.";

  try {
    const prompt = `
      Act as a luxury hotel concierge. 
      Write a short, engaging 2-sentence cultural fact or tip about ${attractionName} in ${city}.
      Tailor the tone for a ${travelStyle} traveler.
    `;

    const cacheKey = buildCacheKey('concierge', 'gemini-2.0-flash-lite', prompt);
    if (!forceRefresh) {
        const cached = readCache<string>(cacheKey);
        if (cached) return cached;
    }

    const response = await fetchGemini('gemini-2.0-flash-lite', buildTextRequest(prompt, 512));
    const text = extractText(response);
    if (text) writeCache(cacheKey, text);
    return text || "Information unavailable at the moment.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Our concierge service is momentarily unavailable.";
  }
};

export const generateSouvenirCaption = async (
  location: string,
  travelStyle: TravelStyle,
  forceRefresh = false
): Promise<string> => {
  if (!apiKey) return "To travel is to live.";

  try {
    const prompt = `
      Generate a short, inspiring travel quote (max 10 words) for a postcard from ${location}.
      The vibe should be ${travelStyle}. 
      Do not include quotes or attribution, just the text.
    `;

    const cacheKey = buildCacheKey('souvenir-caption', 'gemini-2.0-flash-lite', prompt);
    if (!forceRefresh) {
        const cached = readCache<string>(cacheKey);
        if (cached) return cached;
    }

    const response = await fetchGemini('gemini-2.0-flash-lite', buildTextRequest(prompt, 128));
    const text = extractText(response);
    if (text) writeCache(cacheKey, text);
    return text?.trim() || "Memories made here.";
  } catch (error) {
    return "A moment in time.";
  }
};

export const generatePostcardImage = async (
    hotelName: string,
    location: string,
    style: TravelStyle,
    forceRefresh = false
): Promise<string | null> => {
    if (!apiKey) return null;

    try {
        const prompt = `Premium travel postcard of ${hotelName}, ${location}. ${style} vibe, warm lighting, scenic view. No text.`;

        const cacheKey = buildCacheKey('postcard-image', 'gemini-2.5-flash-image', prompt);
        if (!forceRefresh) {
            const cached = readCache<string>(cacheKey);
            if (cached) return cached;
        }

        const image = await fetchImageWithFallback(
            'gemini-2.5-flash-image',
            prompt,
            256,
            1024
        );
        if (image) writeCache(cacheKey, image);
        return image;
    } catch (error) {
        console.error("Postcard Gen Error:", error);
        return null;
    }
}

// "Nano Banana" - Avatar Generation
export const generateAvatar = async (
    style: TravelStyle,
    forceRefresh = false
): Promise<string | null> => {
    if (!apiKey) return null;

    try {
        // Updated prompt for cleaner, brighter, preset-matching style
        const prompt = `Cute 3D traveler avatar, ${style} style, bright studio lighting, clean white background, centered headshot.`;

        const cacheKey = buildCacheKey('avatar-image', 'gemini-2.5-flash-image', prompt);
        if (!forceRefresh) {
            const cached = readCache<string>(cacheKey);
            if (cached) return cached;
        }

        const image = await fetchImageWithFallback(
            'gemini-2.5-flash-image',
            prompt,
            256,
            1024
        );
        if (image) writeCache(cacheKey, image);
        return image;
    } catch (error) {
        console.error("Avatar Gen Error:", error);
        return null;
    }
}

// "Nano Banana" - Attraction 3D Asset Generation
export const generateAttractionImage = async (
    type: string,
    name: string,
    forceRefresh = false
): Promise<string | null> => {
    if (!apiKey) return null;

    try {
        const prompt = `Cute 3D icon for ${type} (${name}), toy-like, bright colors, soft studio lighting, white background, single object.`;

        const cacheKey = buildCacheKey('attraction-image', 'gemini-2.5-flash-image', prompt);
        if (!forceRefresh) {
            const cached = readCache<string>(cacheKey);
            if (cached) return cached;
        }

        const image = await fetchImageWithFallback(
            'gemini-2.5-flash-image',
            prompt,
            256,
            768
        );
        if (image) writeCache(cacheKey, image);
        return image;
    } catch (error) {
        console.error("Attraction Image Gen Error:", error);
        return null;
    }
}

// NEW: Dynamic Attraction Generation (JSON)
export const generateDynamicAttractions = async (
    location: string,
    style: TravelStyle,
    forceRefresh = false
): Promise<Attraction[]> => {
    if (!apiKey) return [];

    try {
        const prompt = `
            Identify 3 "Nearby" hidden gems/activities and 3 "Must-See" famous landmarks in ${location}.
            Target Audience: ${style} traveler.
            Return a JSON object with a list of attractions.
            For 'icon', suggest a valid Material Symbol name (snake_case) that represents the place (e.g. 'restaurant', 'park', 'museum', 'photo_camera').
        `;

        const cacheKey = buildCacheKey('dynamic-attractions', 'gemini-2.0-flash-lite', prompt);
        if (!forceRefresh) {
            const cached = readCache<Attraction[]>(cacheKey);
            if (cached) return cached;
        }

        const response = await fetchGemini('gemini-2.0-flash-lite', buildTextRequest(prompt, 1024));
        const text = extractText(response) || "{}";
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
        const json = JSON.parse(jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text);
        const list = json.attractions || [];

        // Map to internal Attraction interface
        const mapped = list.map((item: any, index: number) => ({
            id: 9000 + index + Math.floor(Math.random() * 1000), // Random ID to avoid collision
            name: item.name,
            type: item.type,
            category: item.category,
            icon: item.icon || 'place',
            description: item.description,
            coordinates: { top: '50%', left: '50%' }, // Dummy coordinates as we use iframe maps
            imageUrl: '' // Will be generated separately
        }));
        writeCache(cacheKey, mapped);
        return mapped;

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
        const systemPrompt = `You are a helpful, sophisticated hotel concierge at ${context}. Keep answers brief (under 50 words) and helpful.`;
        const prompt = `${systemPrompt}\n\nUser: ${message}`;
        const response = await fetchGemini('gemini-2.0-flash-lite', buildTextRequest(prompt, 512));
        return extractText(response) || "";
    } catch (error) {
        console.error("Chat Error", error);
        return "I am having trouble connecting to the concierge network.";
    }
}

export const generateItinerary = async (
    booking: Booking,
    style: TravelStyle,
    forceRefresh = false
): Promise<string> => {
    if (!apiKey) return "Itinerary generation offline.";

    try {
        const prompt = `
            Create a brief, daily itinerary for a trip to ${booking.location}.
            Traveler Style: ${style}.
            Dates: ${booking.checkInDate} to ${booking.checkOutDate}.
            Format: Markdown, bullet points.
            Focus: Provide a "Theme of the Day" and 2 key activities per day.
            Keep it concise and exciting.
        `;

        const cacheKey = buildCacheKey('itinerary', 'gemini-2.0-flash-lite', prompt);
        if (!forceRefresh) {
            const cached = readCache<string>(cacheKey);
            if (cached) return cached;
        }

        const response = await fetchGemini('gemini-2.0-flash-lite', buildTextRequest(prompt, 1024));
        const text = extractText(response) || "Could not generate itinerary.";
        if (text) writeCache(cacheKey, text);
        return text;
    } catch (error) {
        return "Itinerary service momentarily unavailable.";
    }
}
