import React, { useEffect, useState, useRef } from 'react';
import { UserSession } from '../types';
import { generateSouvenirCaption, generatePostcardImage } from '../services/geminiService';
import { getImageCache, setImageCache } from '../services/cacheService';

interface SouvenirStepProps {
  session: UserSession;
}

const SouvenirStep: React.FC<SouvenirStepProps> = ({ session }) => {
  const [caption, setCaption] = useState('');
  const [postcardImage, setPostcardImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);
  const HILTON_LOGO = "https://www.hilton.com/modules/assets/svgs/logos/WW.svg";
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const fetchContent = async () => {
        setLoading(true);
        const captionKey = `guest-companion:postcard-caption:${session.booking.orderId}`;
        const imageKey = `guest-companion:postcard-image:${session.booking.orderId}`;
        const failedKey = `guest-companion:postcard-image-failed:${session.booking.orderId}`;
        const cachedCaption = localStorage.getItem(captionKey);
        const cachedImage = await getImageCache(imageKey);
        const failedFlag = localStorage.getItem(failedKey);
        if (cachedCaption) setCaption(cachedCaption);
        if (cachedImage) setPostcardImage(cachedImage);
        if (failedFlag && !cachedImage) setImageFailed(true);
        if (cachedCaption || cachedImage || failedFlag) {
            setLoading(false);
            return;
        }

        const text = await generateSouvenirCaption(session.booking.location, session.travelStyle);
        setCaption(text);
        localStorage.setItem(captionKey, text);
        setImageFailed(true);
        setLoading(false);
    };
    fetchContent();
  }, [session]);

  const handleRetryImage = async () => {
    setLoading(true);
    setImageFailed(false);
    const imageKey = `guest-companion:postcard-image:${session.booking.orderId}`;
    const failedKey = `guest-companion:postcard-image-failed:${session.booking.orderId}`;
    localStorage.removeItem(failedKey);

    const image = await generatePostcardImage(session.booking.hotelName, session.booking.location, session.travelStyle);
    setPostcardImage(image);
    setLoading(false);
    if (image) {
        await setImageCache(imageKey, image);
    } else {
        setImageFailed(true);
        localStorage.setItem(failedKey, '1');
    }
  };

  const handleSavePhoto = () => {
    const imageUrl = postcardImage || session.booking.backgroundImage;
    if (!imageUrl) return;
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `hilton-postcard-${session.booking.orderId}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleShare = async () => {
    const imageUrl = postcardImage || session.booking.backgroundImage;
    if (!imageUrl) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${session.booking.hotelName} postcard`,
          text: caption || `A moment from ${session.booking.location}`,
          url: imageUrl
        });
        return;
      } catch {
        // Fall back to clipboard when share is canceled or fails
      }
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(imageUrl);
      alert('Link copied to clipboard.');
    }
  };

  return (
    <div className="relative w-full max-w-[420px] h-[100dvh] sm:h-[850px] bg-background-light sm:bg-white sm:rounded-3xl sm:shadow-2xl flex flex-col overflow-hidden transition-all duration-300 hilton-outline">
        {/* Nav */}
        <header className="flex items-center justify-between px-6 py-4 z-30">
            <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-50 text-slate-800 transition-colors">
                <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <div className="flex flex-col items-center select-none opacity-80">
                <img src={HILTON_LOGO} alt="Hilton" className="h-6 object-contain" />
            </div>
            <button
                onClick={handleShare}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-50 text-primary transition-colors hilton-glow"
            >
                <span className="material-symbols-outlined">ios_share</span>
            </button>
        </header>

        {/* Content */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 relative z-20 w-full no-scrollbar overflow-y-auto pb-20">
            
            {/* Full Image Card */}
            <div className="relative w-full max-w-[320px] sm:max-w-[360px] aspect-[3/4] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] rotate-[-2deg] transform-gpu mx-auto animate-float transition-all hover:scale-[1.02] hover:rotate-0 hover:z-50 duration-500 group rounded-[2rem] overflow-hidden bg-gray-900 ring-4 ring-white">
                
                {loading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 text-gray-400 z-20">
                         <div className="relative w-20 h-20 mb-6">
                            <div className="absolute inset-0 border-[6px] border-gray-100 rounded-full"></div>
                            <div className="absolute inset-0 border-[6px] border-primary rounded-full border-t-transparent animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="material-symbols-outlined text-primary/40 text-2xl">auto_awesome</span>
                            </div>
                         </div>
                         <span className="text-xs uppercase tracking-[0.2em] font-bold text-primary animate-pulse">Developing Memory</span>
                         <span className="text-[10px] text-gray-400 mt-2">Crafting your unique souvenir...</span>
                    </div>
                ) : imageFailed ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 text-gray-500 z-20">
                        <span className="material-symbols-outlined text-4xl mb-3">image_not_supported</span>
                        <p className="text-xs font-bold uppercase tracking-widest">Image unavailable</p>
                    </div>
                ) : (
                    <>
                        {/* Background Image Layer */}
                        <div 
                           className="absolute inset-0 bg-cover bg-center transition-transform duration-[2000ms] ease-out group-hover:scale-110"
                           style={{ backgroundImage: `url(${postcardImage || session.booking.backgroundImage})` }}
                        ></div>
                        
                        {/* Gradient Overlays for Readability */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/10 mix-blend-multiply transition-opacity duration-500"></div>
                        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60 opacity-80"></div>
                        
                        {/* Content Layer */}
                        <div className="absolute inset-0 p-8 flex flex-col justify-between z-10">
                            
                            {/* Top: Badges */}
                            <div className="flex justify-between items-start">
                                <div className="px-3 py-1.5 bg-black/20 backdrop-blur-md rounded-full border border-white/10 shadow-lg">
                                   <span className="text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                                      <span className="material-symbols-outlined text-[12px] text-gold">star</span>
                                      {session.travelStyle} Trip
                                   </span>
                                </div>
                                <div className="px-3 py-1.5 bg-white/10 backdrop-blur-md rounded-full border border-white/20 shadow-lg">
                                   <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                                      AI Generated
                                   </span>
                                </div>
                            </div>
             
                            {/* Bottom: Text Content */}
                            <div className="space-y-6">
                                {/* Caption Area */}
                                <div className="text-center space-y-4">
                                    <p className="font-serif text-2xl sm:text-3xl text-white/95 leading-tight italic font-medium drop-shadow-xl animate-fade-in">
                                        "{caption}"
                                    </p>
                                    
                                    <div className="flex items-center justify-center gap-3 opacity-90">
                                        <div className="h-px w-8 bg-gradient-to-r from-transparent to-white/60"></div>
                                        <p className="font-display text-[10px] text-white font-bold uppercase tracking-[0.25em] drop-shadow-md text-center">
                                            {session.booking.hotelName}
                                        </p>
                                        <div className="h-px w-8 bg-gradient-to-l from-transparent to-white/60"></div>
                                    </div>
                                </div>
             
                                {/* Signature & Avatar Row */}
                                <div className="flex items-end justify-between pt-2 pb-1">
                                     {/* Signature Bottom Left */}
                                     <span className="font-cursive text-5xl sm:text-6xl text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)] -rotate-6 translate-y-3 origin-left opacity-90">
                                         {session.booking.firstName}
                                     </span>
             
                                     {/* Avatar Bottom Right */}
                                     <div className="relative group/avatar">
                                         <div className="w-14 h-14 rounded-full border-[3px] border-white/90 shadow-2xl overflow-hidden bg-white/20 backdrop-blur-md transition-transform group-hover/avatar:scale-110">
                                             <img src={session.generatedAvatar} alt="Me" className="w-full h-full object-cover" />
                                         </div>
                                     </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
                
                {/* Texture/Noise Overlay for Film Effect */}
                <div className="absolute inset-0 bg-white opacity-[0.03] pointer-events-none mix-blend-overlay"></div>
                <div className="absolute inset-0 border-2 border-white/10 rounded-[2rem] pointer-events-none"></div>
            </div>

            <div className="mt-12 text-center space-y-2 animate-fade-in">
                <h3 className="text-[#111418] font-bold text-xl tracking-tight">Your Journey in {session.booking.location.split(',')[0]}</h3>
                <p className="text-slate-500 text-sm max-w-[260px] mx-auto leading-relaxed">
                    A personalized keepsake crafted by Hilton AI.
                </p>
                <div className="hilton-gold-divider w-20 mx-auto"></div>
            </div>
        </main>

        {/* Footer Actions */}
        <footer className="px-8 pb-10 pt-4 w-full flex flex-col gap-4 z-30 bg-gradient-to-t from-background-light via-background-light to-transparent">
             <div className="flex flex-col sm:flex-row gap-3">
                 <button
                     onClick={handleRetryImage}
                     className="w-full h-12 rounded-2xl border border-gold/40 text-primary-dark font-bold text-sm flex items-center justify-center gap-2 hover:bg-gold/10 transition-all"
                 >
                     <span className="material-symbols-outlined text-sm">refresh</span>
                     <span>{postcardImage ? 'Regenerate Image' : 'Generate Image'}</span>
                 </button>
                 <button
                     className="relative group w-full h-12 overflow-hidden bg-primary hover:bg-primary-dark text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-3 shadow-xl transition-all active:scale-[0.98] hilton-sheen"
                     onClick={handleSavePhoto}
                 >
                    <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                    <span className="material-symbols-outlined relative z-10">download</span>
                    <span className="relative z-10">Save to Photos</span>
                 </button>
             </div>
        </footer>
    </div>
  );
};

export default SouvenirStep;
