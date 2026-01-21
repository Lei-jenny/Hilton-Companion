import React, { useState, useRef, useEffect } from 'react';
import { UserSession, Attraction } from '../types';
import { MOCK_ATTRACTIONS } from '../services/mockService';
import { generateConciergeInfo, chatWithConcierge, generateItinerary, generateAttractionImage, generateDynamicAttractions, fetchBingImageForQuery } from '../services/geminiService';
import { getImageCache, setImageCache, deleteImageCache } from '../services/cacheService';
import ReactMarkdown from 'react-markdown';

interface DashboardStepProps {
  session: UserSession;
}

const DashboardStep: React.FC<DashboardStepProps> = ({ session }) => {
  const [selectedAttraction, setSelectedAttraction] = useState<Attraction | null>(null);
  
  // Dynamic Attractions State
  const [attractions, setAttractions] = useState<Attraction[]>([]);
  const [loadingAttractions, setLoadingAttractions] = useState(true);

  // AI Content State
  const [aiContent, setAiContent] = useState<string>('');
  const [loadingAi, setLoadingAi] = useState(false);
  // Cache for insights: { attractionName: content }
  const [insightCache, setInsightCache] = useState<Record<string, string>>({});
  
  // Image Generation State
  const [generatedImages, setGeneratedImages] = useState<Record<number, string>>({});
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});
  const imageRequestRef = useRef<Set<number>>(new Set());
  const lastAttractionKeyRef = useRef('');
  const failedRetryRef = useRef<Set<string>>(new Set());
  
  // Itinerary State
  const [itinerary, setItinerary] = useState<string>('');
  const [loadingItinerary, setLoadingItinerary] = useState(false);

  // Map State
  const [mapUrl, setMapUrl] = useState('');
  const [mapKey, setMapKey] = useState(0); // Force iframe refresh

  // Direction State
  const [directionStep, setDirectionStep] = useState<'initial' | 'calculating' | 'ready'>('initial');
  const [calculatedTime, setCalculatedTime] = useState('');

  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: string, text: string}[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const hasInitializedRef = useRef(false);

  // Extract City name for dynamic header (simple split by comma)
  const city = session.booking.location.split(',')[0];

  // Derived lists
  const nearbyAttractions = attractions.filter(a => a.category === 'Nearby').slice(0, 2);
  const popularAttractions = attractions.filter(a => a.category === 'Must-See').slice(0, 2);

  const validateImage = (src: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = src;
    });
  };

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    // 1. Initial Map Setup (Centered on Hotel)
    const baseMap = `https://maps.google.com/maps?q=${encodeURIComponent(session.booking.hotelName + " " + session.booking.location)}&t=&z=14&ie=UTF8&iwloc=&output=embed`;
    setMapUrl(baseMap);

    // 2. Load Attractions (Mock or Dynamic)
    const loadAttractions = async () => {
        setLoadingAttractions(true);
        const existing = MOCK_ATTRACTIONS[session.booking.orderId];
        
        if (existing) {
            setAttractions(existing);
        } else {
            const cacheKey = `guest-companion:dynamic-attractions:${session.booking.location}:${session.travelStyle}`;
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                try {
                    setAttractions(JSON.parse(cached));
                } catch {
                    // Ignore cache parsing issues
                }
            } else {
                // Fetch dynamically
                const dynamicList = await generateDynamicAttractions(session.booking.location, session.travelStyle);
                setAttractions(dynamicList);
                localStorage.setItem(cacheKey, JSON.stringify(dynamicList));
            }
        }
        setLoadingAttractions(false);
    };
    loadAttractions();

    // 3. Generate Itinerary
    const fetchItinerary = async () => {
        setLoadingItinerary(true);
        const cacheKey = `guest-companion:itinerary:${session.booking.orderId}:${session.travelStyle}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            setItinerary(cached);
            setLoadingItinerary(false);
            return;
        }

        const text = await generateItinerary(session.booking, session.travelStyle);
        setItinerary(text);
        setLoadingItinerary(false);
        localStorage.setItem(cacheKey, text);
    }
    fetchItinerary();

  }, [session]);

  // Trigger Image Generation when `attractions` updates
  useEffect(() => {
    if (attractions.length === 0) return;
    const attractionKey = attractions.map(attr => attr.id).join('|');
    if (lastAttractionKeyRef.current === attractionKey) return;
    lastAttractionKeyRef.current = attractionKey;

    const fetchImages = async () => {
        for (const attr of attractions) {
             // If we already generated, failed, or have a URL, skip
             if (generatedImages[attr.id] || failedImages[attr.id] || attr.imageUrl) continue;
             if (imageRequestRef.current.has(attr.id)) continue;

             // Check local cache
            const cacheKey = `guest-companion:attraction-image:${session.booking.location}:${attr.type}:${attr.name}`;

            const cachedImage = await getImageCache(cacheKey);
             if (cachedImage) {
                const cachedValid = await validateImage(cachedImage);
                if (cachedValid) {
                    setGeneratedImages(prev => ({...prev, [attr.id]: cachedImage}));
                    continue;
                }
                await deleteImageCache(cacheKey);
             }

            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                if (cached === 'FAILED') {
                    const retryKey = `${session.booking.location}:${attr.type}:${attr.name}`;
                    if (failedRetryRef.current.has(retryKey)) {
                        setFailedImages(prev => ({...prev, [attr.id]: true}));
                        continue;
                    }
                    failedRetryRef.current.add(retryKey);
                } else {
                    const cachedValid = await validateImage(cached);
                    if (cachedValid) {
                        setGeneratedImages(prev => ({...prev, [attr.id]: cached}));
                        await setImageCache(cacheKey, cached);
                        localStorage.removeItem(cacheKey);
                        continue;
                    }
                    localStorage.removeItem(cacheKey);
                }
            }

             imageRequestRef.current.add(attr.id);
             const img = await generateAttractionImage(attr.type, attr.name);
            if (img) {
                const valid = await validateImage(img);
                if (valid) {
                    setGeneratedImages(prev => ({...prev, [attr.id]: img}));
                    await setImageCache(cacheKey, img);
                    localStorage.removeItem(cacheKey);
                    continue;
                }
            }

            const bingImage = await fetchBingImageForQuery(`${attr.name} ${attr.type}`);
            if (bingImage && await validateImage(bingImage)) {
                setGeneratedImages(prev => ({...prev, [attr.id]: bingImage}));
                await setImageCache(cacheKey, bingImage);
                localStorage.removeItem(cacheKey);
            } else {
                setFailedImages(prev => ({...prev, [attr.id]: true}));
                localStorage.setItem(cacheKey, 'FAILED');
            }
        }
    };
    fetchImages();
  }, [attractions]);

  const handleRefreshItinerary = async () => {
    if (loadingItinerary) return;
    setLoadingItinerary(true);
    const cacheKey = `guest-companion:itinerary:${session.booking.orderId}:${session.travelStyle}`;
    localStorage.removeItem(cacheKey);
    const text = await generateItinerary(session.booking, session.travelStyle);
    setItinerary(text);
    setLoadingItinerary(false);
    localStorage.setItem(cacheKey, text);
  };

  const handleAttractionClick = async (attraction: Attraction) => {
    setSelectedAttraction(attraction);
    setDirectionStep('initial'); 
    
    // Update map to center on attraction (Simple Pin)
    const attrMap = `https://maps.google.com/maps?q=${encodeURIComponent(attraction.name + " " + session.booking.location)}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
    setMapUrl(attrMap);
    setMapKey(prev => prev + 1); // Force reload

    // Check Cache first
    if (insightCache[attraction.name]) {
        setAiContent(insightCache[attraction.name]);
        setLoadingAi(false);
    } else {
        const cacheKey = `guest-companion:insight:${session.booking.location}:${session.travelStyle}:${attraction.name}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            setAiContent(cached);
            setInsightCache(prev => ({...prev, [attraction.name]: cached}));
            setLoadingAi(false);
            return;
        }

        setLoadingAi(true);
        setAiContent('');
        
        // Call Gemini
        const content = await generateConciergeInfo(
          attraction.name, 
          session.booking.location, 
          session.travelStyle
        );
        
        setAiContent(content);
        setInsightCache(prev => ({...prev, [attraction.name]: content}));
        localStorage.setItem(cacheKey, content);
        setLoadingAi(false);
    }
  };

  const closeDrawer = () => {
    setSelectedAttraction(null);
  };

  const handleReturnToHotel = () => {
      // Reset to hotel view
      const baseMap = `https://maps.google.com/maps?q=${encodeURIComponent(session.booking.hotelName + " " + session.booking.location)}&t=&z=14&ie=UTF8&iwloc=&output=embed`;
      setMapUrl(baseMap);
      setMapKey(prev => prev + 1); // Force reload
      setSelectedAttraction(null);
  };

  const handleCalculateRoute = () => {
      setDirectionStep('calculating');
      // Simulate calculation delay
      setTimeout(() => {
          const randomMins = Math.floor(Math.random() * 20) + 10;
          setCalculatedTime(`${randomMins} min drive`);
          setDirectionStep('ready');

          // Update Map to show Directions
          if (selectedAttraction) {
              const start = encodeURIComponent(session.booking.hotelName);
              const end = encodeURIComponent(selectedAttraction.name);
              // Using saddr/daddr to force direction mode in legacy embed
              const dirMap = `https://maps.google.com/maps?saddr=${start}&daddr=${end}&output=embed&z=12`;
              setMapUrl(dirMap);
              setMapKey(prev => prev + 1); // Force reload
          }
      }, 1500);
  };

  const handleOpenMaps = () => {
      if (selectedAttraction) {
          window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selectedAttraction.name + ' ' + session.booking.location)}`, '_blank');
      }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!chatMessage.trim()) return;

      const userMsg = chatMessage;
      setChatMessage('');
      setChatHistory(prev => [...prev, {role: 'user', text: userMsg}]);
      setIsChatLoading(true);

      // Convert format for API
      const historyForApi = chatHistory.map(h => ({
          role: h.role,
          parts: [{ text: h.text }]
      }));

      const response = await chatWithConcierge(userMsg, historyForApi, session.booking.hotelName);
      
      setChatHistory(prev => [...prev, {role: 'model', text: response || "I'm sorry, I couldn't understand that."}]);
      setIsChatLoading(false);
  };

  useEffect(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isChatOpen]);

  // Render Helper for Images
  const renderAttractionImage = (attr: Attraction) => {
      const img = generatedImages[attr.id] || attr.imageUrl;
      
      if (!img && !failedImages[attr.id]) {
          return (
            <div className="w-20 h-20 rounded-xl bg-gray-50 flex flex-col items-center justify-center shrink-0 border border-gray-100 shadow-inner">
                 <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin mb-1"></div>
                 <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wide">Generating 3D...</span>
            </div>
          );
      }

      if (!img && failedImages[attr.id]) {
          return (
            <div className="w-20 h-20 rounded-xl bg-gray-200/80 flex items-center justify-center shrink-0 border border-gray-200">
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wide">Unavailable</span>
            </div>
          );
      }

      return (
         <div className="w-20 h-20 rounded-xl bg-white bg-cover bg-center shrink-0 shadow-inner border border-gray-100" style={{ backgroundImage: `url(${img})` }}></div>
      );
  };

  const renderLargeAttractionImage = (attr: Attraction) => {
      const img = generatedImages[attr.id] || attr.imageUrl;
      
      if (!img && !failedImages[attr.id]) {
          return (
            <div className="w-full h-56 rounded-3xl bg-gray-50 flex flex-col items-center justify-center mb-8 border border-gray-100">
                 <div className="relative w-16 h-16 mb-3">
                     <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
                     <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
                 </div>
                 <p className="text-sm font-bold text-slate-500 animate-pulse">Creating 3D Asset...</p>
            </div>
          );
      }

      if (!img && failedImages[attr.id]) {
          return (
            <div className="w-full h-56 rounded-3xl bg-gray-200/80 flex items-center justify-center mb-8 border border-gray-200">
                <p className="text-sm font-bold text-slate-600">Image unavailable</p>
            </div>
          );
      }

      return (
          <img src={img} alt={attr.name} className="w-full h-56 object-cover rounded-3xl mb-8 shadow-lg bg-white" />
      );
  }

  return (
    <div className="relative w-full max-w-[480px] h-full sm:h-[90vh] bg-white sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/10 animate-fade-in font-display hilton-outline">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-6 py-4 bg-white/95 backdrop-blur-xl border-b border-light-gray hilton-glass">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white shadow-lg shadow-primary/30">
                <span className="material-symbols-outlined text-lg">diamond</span>
            </div>
            <div>
                <h1 className="text-primary text-[10px] font-bold tracking-widest uppercase mb-0.5">
                    Concierge
                </h1>
                <p className="text-primary-dark text-xs font-bold truncate max-w-[220px]">
                    {session.booking.hotelName}
                </p>
            </div>
        </div>
        <div className="size-9 rounded-full overflow-hidden border-2 border-white shadow-md ring-1 ring-gray-100 bg-gray-50">
             {session.generatedAvatar ? (
                 <img src={session.generatedAvatar} alt="User" className="w-full h-full object-cover" />
             ) : (
                 <div className="w-full h-full bg-gray-100"></div>
             )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pt-24 pb-32 no-scrollbar bg-background-light">
        {/* Greeting */}
        <div className="px-6 mb-8">
            <p className="text-medium-gray text-xs font-bold uppercase tracking-wider mb-1">
                {session.booking.location}
            </p>
            <h2 className="text-3xl font-serif font-medium text-primary-dark leading-tight">
                Hello, {session.booking.firstName}.
            </h2>
            <div className="hilton-gold-divider w-16 mt-4"></div>
        </div>

        {/* Interactive Map */}
        <div className="px-6 mb-8">
             <div className="relative w-full h-[280px] rounded-3xl overflow-hidden shadow-xl shadow-slate-200/50 border border-white group hilton-glow">
                {mapUrl ? (
                    <iframe 
                        key={mapKey}
                        width="100%" 
                        height="100%" 
                        frameBorder="0" 
                        scrolling="no" 
                        marginHeight={0} 
                        marginWidth={0} 
                        src={mapUrl}
                        className="w-full h-full grayscale-[20%] contrast-[110%]"
                        title="Hotel Map"
                    ></iframe>
                ) : (
                    <div className="w-full h-full bg-gray-100 animate-pulse"></div>
                )}
                
                {/* Return to Hotel Button (On Map) */}
                <button 
                    onClick={handleReturnToHotel}
                    className="absolute top-4 right-4 bg-white text-slate-900 shadow-lg rounded-xl p-3 flex items-center justify-center transition-all z-20 hover:scale-105 active:scale-95 border border-gray-100"
                    title="Return to Hotel"
                >
                    <span className="material-symbols-outlined text-xl">home_pin</span>
                </button>

                {/* Map Overlay Controls */}
                <div className="absolute bottom-4 left-4 right-4 flex gap-2 overflow-x-auto no-scrollbar pb-1 pointer-events-none">
                     <div className="flex gap-2 pointer-events-auto">
                        {loadingAttractions ? (
                             // Skeleton for pills
                             [1,2,3].map(i => (
                                 <div key={i} className="h-8 w-20 bg-gray-200/80 animate-pulse rounded-full backdrop-blur"></div>
                             ))
                        ) : (
                            nearbyAttractions.map((attr) => (
                                <button key={attr.id} onClick={() => handleAttractionClick(attr)} className="flex items-center gap-1.5 bg-white/95 backdrop-blur shadow-md rounded-full pl-2 pr-3 py-1.5 text-[11px] font-bold text-charcoal whitespace-nowrap hover:text-primary hover:bg-white transition-colors border border-gray-100/50">
                                    <span className="material-symbols-outlined text-sm text-gold">{attr.icon}</span>
                                    {attr.name}
                                </button>
                            ))
                        )}
                     </div>
                </div>
             </div>
        </div>

        {/* Recommendations List */}
        <div className="px-6 space-y-8">
             
             {loadingAttractions ? (
                 <div className="space-y-4">
                     <div className="h-4 bg-gray-200 rounded w-1/3 animate-pulse"></div>
                     <div className="h-20 bg-gray-100 rounded-2xl animate-pulse"></div>
                     <div className="h-20 bg-gray-100 rounded-2xl animate-pulse"></div>
                 </div>
             ) : (
                <>
                 {/* Nearby */}
                 <div>
                     <h3 className="text-sm font-bold text-primary-dark mb-4 flex items-center gap-2 uppercase tracking-wide">
                        Nearby Gems
                     </h3>
                     <div className="grid grid-cols-1 gap-4">
                        {nearbyAttractions.map((attr) => (
                            <div 
                                key={attr.id}
                                onClick={() => handleAttractionClick(attr)}
                                className="group flex items-center gap-4 p-3 bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-lg transition-all cursor-pointer border border-transparent hover:border-primary/10"
                            >
                                {renderAttractionImage(attr)}
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-base text-primary-dark truncate group-hover:text-primary transition-colors">{attr.name}</h4>
                                    <p className="text-xs text-medium-gray truncate mb-2">{attr.type}</p>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-all">
                                    <span className="material-symbols-outlined text-lg">arrow_forward</span>
                                </div>
                            </div>
                        ))}
                     </div>
                 </div>

                 {/* Popular */}
                 <div>
                     <h3 className="text-sm font-bold text-primary-dark mb-4 flex items-center gap-2 uppercase tracking-wide">
                        Trending in {city}
                     </h3>
                     <div className="grid grid-cols-1 gap-4">
                        {popularAttractions.map((attr) => (
                            <div 
                                key={attr.id}
                                onClick={() => handleAttractionClick(attr)}
                                className="group flex items-center gap-4 p-3 bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-lg transition-all cursor-pointer border border-transparent hover:border-primary/10"
                            >
                                 {renderAttractionImage(attr)}
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-base text-primary-dark truncate group-hover:text-primary transition-colors">{attr.name}</h4>
                                    <p className="text-xs text-medium-gray line-clamp-2 leading-relaxed">{attr.description}</p>
                                </div>
                            </div>
                        ))}
                     </div>
                 </div>
                </>
             )}

             {/* AI Itinerary */}
             <div className="bg-primary-dark p-6 rounded-3xl text-white shadow-xl shadow-slate-300 relative overflow-hidden hilton-sheen">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                     <span className="material-symbols-outlined text-[120px]">calendar_month</span>
                </div>
                <div className="relative z-10">
                    <div className="flex items-center justify-between gap-3 mb-5">
                        <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gold">
                             <span className="material-symbols-outlined text-lg">auto_awesome</span>
                        </div>
                        <h3 className="font-serif text-xl font-medium">Your AI Itinerary</h3>
                        </div>
                        <button
                            onClick={handleRefreshItinerary}
                            disabled={loadingItinerary}
                            className="text-xs font-bold uppercase tracking-wider text-gold/90 hover:text-gold transition-colors disabled:opacity-40"
                        >
                            Refresh
                        </button>
                    </div>
                    {loadingItinerary ? (
                        <div className="space-y-4 opacity-50">
                            <div className="h-2 bg-white/20 rounded w-3/4 animate-pulse"></div>
                            <div className="h-2 bg-white/20 rounded w-1/2 animate-pulse"></div>
                            <div className="h-2 bg-white/20 rounded w-full animate-pulse"></div>
                        </div>
                    ) : (
                        <div className="text-sm font-light leading-relaxed text-gray-200">
                             <ReactMarkdown 
                                components={{
                                    h1: ({node, ...props}) => <h1 className="text-base font-bold text-gold mt-4 mb-2 uppercase tracking-wider" {...props} />,
                                    h2: ({node, ...props}) => <h2 className="text-sm font-bold text-white mt-3 mb-1" {...props} />,
                                    ul: ({node, ...props}) => <ul className="list-none space-y-2 my-2" {...props} />,
                                    li: ({node, ...props}) => <li className="text-xs text-gray-300 pl-4 border-l border-white/20" {...props} />,
                                    p: ({node, ...props}) => <p className="text-xs text-gray-400 mb-2" {...props} />,
                                    strong: ({node, ...props}) => <strong className="text-white font-medium" {...props} />
                                }}
                             >
                                {itinerary}
                             </ReactMarkdown>
                        </div>
                    )}
                </div>
             </div>
        </div>
      </main>

      {/* Floating Action Button */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center px-6 z-40 pointer-events-none">
        <button 
            onClick={() => setIsChatOpen(true)}
            className="pointer-events-auto flex items-center justify-center gap-3 bg-primary text-white font-bold py-4 px-8 rounded-full shadow-2xl hover:scale-[1.02] active:scale-95 transition-all w-full max-w-sm border border-white/10 hilton-sheen"
        >
            <span className="material-symbols-outlined">smart_toy</span>
            <span>Ask Concierge</span>
        </button>
      </div>

      {/* Drawer/Modal for Attraction Details */}
      {selectedAttraction && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-t-[2rem] p-6 shadow-2xl animate-slide-up h-[85%] flex flex-col">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-3xl font-serif font-medium text-slate-900">{selectedAttraction.name}</h3>
                        <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] font-bold uppercase text-primary tracking-widest bg-primary/5 px-2 py-1 rounded-md">{selectedAttraction.category}</span>
                            <span className="text-[10px] font-bold uppercase text-slate-400 tracking-widest bg-slate-50 px-2 py-1 rounded-md">{selectedAttraction.type}</span>
                        </div>
                    </div>
                    <button onClick={closeDrawer} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
                        <span className="material-symbols-outlined text-slate-600">close</span>
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto no-scrollbar pb-6">
                    {renderLargeAttractionImage(selectedAttraction)}
                    
                    <div className="bg-[#fffbf0] p-6 rounded-3xl relative overflow-hidden mb-8 border border-amber-100">
                        <span className="material-symbols-outlined absolute -top-4 -right-4 text-amber-500/10 text-[120px]">history_edu</span>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-amber-600 text-sm">lightbulb</span>
                                <span className="text-xs font-bold uppercase tracking-widest text-amber-700">Gemini Insight</span>
                            </div>
                            {loadingAi ? (
                                <div className="space-y-2 animate-pulse">
                                    <div className="h-4 bg-amber-500/10 rounded w-3/4"></div>
                                    <div className="h-4 bg-amber-500/10 rounded w-full"></div>
                                    <div className="h-4 bg-amber-500/10 rounded w-5/6"></div>
                                </div>
                            ) : (
                                <p className="text-sm text-amber-900/80 font-serif leading-relaxed italic">
                                    "{aiContent}"
                                </p>
                            )}
                        </div>
                    </div>
                    
                    <h4 className="font-bold text-slate-900 mb-2">About this place</h4>
                    <p className="text-sm text-slate-500 leading-relaxed">{selectedAttraction.description}</p>
                </div>
                
                {/* Navigation Action */}
                <div className="mt-auto pt-4 space-y-3">
                    {/* View on Google Maps Button */}
                    <button 
                        onClick={handleOpenMaps}
                        className="w-full bg-white text-slate-900 border border-slate-200 font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
                    >
                         <span className="material-symbols-outlined text-red-500">map</span>
                         <span>Open in Google Maps</span>
                    </button>

                    {directionStep === 'initial' && (
                        <button 
                            onClick={handleCalculateRoute}
                            className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-colors"
                        >
                            <span className="material-symbols-outlined">directions</span>
                            <span>Plan Route Here</span>
                        </button>
                    )}

                    {directionStep === 'calculating' && (
                        <button disabled className="w-full bg-slate-100 text-slate-400 font-bold py-4 rounded-xl flex items-center justify-center gap-2 cursor-wait">
                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            <span>Calculating...</span>
                        </button>
                    )}

                    {directionStep === 'ready' && (
                         <div className="flex flex-col gap-2 animate-fade-in">
                             <div className="bg-green-50 text-green-700 p-3 rounded-xl flex items-center justify-center gap-2 border border-green-100">
                                <span className="material-symbols-outlined text-sm">timer</span>
                                <span className="font-bold text-sm">{calculatedTime} from hotel</span>
                             </div>
                             <button 
                                onClick={handleOpenMaps}
                                className="w-full bg-primary text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-primary-dark transition-colors"
                            >
                                <span className="material-symbols-outlined">navigation</span>
                                <span>Navigate Now</span>
                            </button>
                         </div>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* Chat Modal - Styled */}
      {isChatOpen && (
          <div className="absolute inset-0 z-50 flex flex-col bg-background-light animate-fade-in">
              <div className="flex items-center justify-between p-4 bg-white/90 backdrop-blur border-b border-gray-100">
                  <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-white">
                           <span className="material-symbols-outlined text-sm">smart_toy</span>
                       </div>
                       <span className="font-bold text-slate-900">Concierge Chat</span>
                  </div>
                  <button onClick={() => setIsChatOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                      <span className="material-symbols-outlined">close</span>
                  </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                  <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-white shrink-0 shadow-md">
                          <span className="material-symbols-outlined text-sm">support_agent</span>
                      </div>
                      <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm text-sm text-slate-600 max-w-[85%] border border-gray-100">
                          Hello! I'm your digital concierge. Ask me anything about {session.booking.hotelName} or {city}.
                      </div>
                  </div>
                  {chatHistory.map((msg, idx) => (
                      <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 shadow-md ${msg.role === 'user' ? 'bg-primary' : 'bg-slate-900'}`}>
                              <span className="material-symbols-outlined text-sm">{msg.role === 'user' ? 'person' : 'support_agent'}</span>
                          </div>
                          <div className={`p-4 rounded-2xl shadow-sm text-sm max-w-[85%] ${msg.role === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-white text-slate-600 rounded-tl-none border border-gray-100'}`}>
                              {msg.text}
                          </div>
                      </div>
                  ))}
                  {isChatLoading && (
                      <div className="flex gap-4">
                           <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-white shrink-0">
                                <span className="material-symbols-outlined text-sm">support_agent</span>
                           </div>
                           <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm flex gap-1 border border-gray-100">
                               <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
                               <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></div>
                               <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></div>
                           </div>
                      </div>
                  )}
                  <div ref={chatEndRef}></div>
              </div>
              <form onSubmit={handleChatSubmit} className="p-4 bg-white border-t border-gray-100">
                  <div className="relative">
                      <input 
                        type="text" 
                        value={chatMessage}
                        onChange={(e) => setChatMessage(e.target.value)}
                        placeholder="Type a message..." 
                        className="w-full pl-5 pr-14 py-4 bg-slate-50 rounded-full border-transparent focus:bg-white focus:border-slate-200 focus:ring-4 focus:ring-slate-100 transition-all text-sm font-medium"
                      />
                      <button type="submit" disabled={isChatLoading || !chatMessage.trim()} className="absolute right-2 top-2 p-2 bg-slate-900 text-white rounded-full disabled:opacity-50 hover:bg-black transition-colors shadow-md">
                          <span className="material-symbols-outlined text-sm">arrow_upward</span>
                      </button>
                  </div>
              </form>
          </div>
      )}
    </div>
  );
};

export default DashboardStep;
