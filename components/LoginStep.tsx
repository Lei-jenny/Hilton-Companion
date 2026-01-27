import React, { useState, useRef } from 'react';
import { TravelStyle, Booking, TripStatus, UserSession } from '../types';
import { validateUser, getTripStatus, PRESET_AVATARS, MOCK_BOOKINGS } from '../services/mockService';
import { generateAvatar } from '../services/geminiService';

interface LoginStepProps {
  onLoginSuccess: (session: UserSession) => void;
}

const LoginStep: React.FC<LoginStepProps> = ({ onLoginSuccess }) => {
  const [orderId, setOrderId] = useState('1002');
  const [lastName, setLastName] = useState('Anderson'); // Name field restored
  const [selectedStyle, setSelectedStyle] = useState<TravelStyle>(TravelStyle.SOLO);
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [bookingData, setBookingData] = useState<Booking | null>(null);
  const avatarRequestRef = useRef<Record<string, boolean>>({});

  // Phase 1: Authentication
  const handleFindBooking = () => {
    setError('');
    if (!lastName.trim()) {
        setError('Please enter your name.');
        return;
    }

    // Logic: Validate ID, but capture the Name entered by user for display
    const booking = validateUser(orderId, lastName);
    
    if (booking) {
      // Override the mock name with the user's input so it feels personalized
      const personalizedBooking = { ...booking, firstName: lastName };
      setBookingData(personalizedBooking);
      
      // Default to first preset if no avatar selected yet
      if (!avatar) setAvatar(PRESET_AVATARS[0]);
    } else {
      setError('We could not find a booking with this Order ID. Please check and try again.');
    }
  };

  // Phase 2: Avatar Selection/Generation
  const handleGenerateAIAvatar = async () => {
    setIsGenerating(true);
    const cacheKey = `guest-companion:avatar:${selectedStyle.toLowerCase()}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setAvatar(cached);
      setIsGenerating(false);
      return;
    }
    if (avatarRequestRef.current[cacheKey]) {
      setIsGenerating(false);
      return;
    }
    avatarRequestRef.current[cacheKey] = true;

    const aiAvatar = await generateAvatar(selectedStyle);
    if (aiAvatar) {
        setAvatar(aiAvatar);
        localStorage.setItem(cacheKey, aiAvatar);
    } else {
        setError("Could not generate AI avatar. Please select a preset.");
    }
    setIsGenerating(false);
  };

  const handleStartJourney = () => {
    if (bookingData && avatar) {
      const status = getTripStatus(bookingData);
      onLoginSuccess({
        booking: bookingData,
        travelStyle: selectedStyle,
        status: status,
        generatedAvatar: avatar
      });
    }
  };

  // Debug function to quickly test the Souvenir/Completed page
  const debugTestSouvenir = () => {
    const debugBooking = MOCK_BOOKINGS['1003']; // The Maldives completed trip
    onLoginSuccess({
        booking: debugBooking,
        travelStyle: TravelStyle.LUXURY,
        status: TripStatus.COMPLETED,
        generatedAvatar: PRESET_AVATARS[0]
    });
  };

  if (bookingData) {
    // Render Avatar Selection Phase
    return (
      <div className="relative z-10 w-full max-w-[480px] glass-effect hilton-glass rounded-3xl shadow-soft overflow-hidden flex flex-col animate-fade-in p-8 hilton-outline">
         <div className="flex flex-col items-center text-center mb-6">
            <h2 className="font-serif text-3xl text-primary-dark font-medium mb-2">Create Your Persona</h2>
            <p className="text-medium-gray text-sm">Select your travel style and avatar.</p>
            <div className="hilton-gold-divider w-20 mt-4"></div>
         </div>

         <div className="grid grid-cols-4 gap-2 mb-6">
            {Object.values(TravelStyle).map((style) => (
              <button
                key={style}
                onClick={() => setSelectedStyle(style)}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all duration-200 
                  ${selectedStyle === style 
                    ? 'border-primary bg-primary/5 ring-2 ring-primary ring-offset-1' 
                    : 'border-slate-200 hover:border-primary/50'}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-1 
                  ${selectedStyle === style ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}>
                   <span className="material-symbols-outlined text-[20px]">
                     {style === TravelStyle.BUSINESS ? 'business_center' : 
                      style === TravelStyle.FAMILY ? 'family_restroom' : 
                      style === TravelStyle.SOLO ? 'hiking' : 'diamond'}
                   </span>
                </div>
                <span className={`text-[10px] font-semibold ${selectedStyle === style ? 'text-primary' : 'text-slate-600'}`}>
                  {style}
                </span>
              </button>
            ))}
         </div>

         <div className="mb-2 text-xs font-bold uppercase tracking-widest text-medium-gray text-center">Choose an Avatar</div>
         
         {/* Preset Grid */}
         <div className="grid grid-cols-4 gap-4 mb-6">
            {PRESET_AVATARS.map((preset, idx) => (
                <button 
                    key={idx} 
                    onClick={() => setAvatar(preset)}
                    className={`relative rounded-full aspect-square overflow-hidden border-2 transition-all ${avatar === preset ? 'border-primary ring-2 ring-primary ring-offset-2' : 'border-transparent hover:border-gray-300'}`}
                >
                    <img src={preset} alt={`Avatar ${idx}`} className="w-full h-full object-cover" />
                </button>
            ))}
         </div>

         <div className="flex flex-col items-center mb-8 justify-center min-h-[140px]">
            {isGenerating ? (
              <div className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-primary/20">
                <div className="absolute inset-0 bg-primary/10 animate-pulse"></div>
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/30 to-transparent w-full h-full animate-scan"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary uppercase tracking-widest">Generating</span>
                </div>
              </div>
            ) : (
                <div className="flex flex-col gap-2 w-full">
                     <button 
                        onClick={handleGenerateAIAvatar}
                    className="w-full py-3 border border-dashed border-primary/40 rounded-xl text-primary font-bold text-sm hover:bg-primary/5 flex items-center justify-center gap-2 hilton-sheen"
                    >
                        <span className="material-symbols-outlined">auto_awesome</span>
                        <span>Generate with Nano Banana</span>
                    </button>
                    {avatar && !PRESET_AVATARS.includes(avatar) && (
                         <div className="relative w-24 h-24 mx-auto mt-2 rounded-full border-4 border-primary shadow-lg overflow-hidden">
                            <img src={avatar} className="w-full h-full object-cover" />
                         </div>
                    )}
                </div>
            )}
         </div>

        <button 
            onClick={handleStartJourney}
            disabled={isGenerating}
            className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 hilton-sheen"
        >
            <span>Enter Concierge</span>
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </button>
      </div>
    );
  }

  // Render Login Phase
  return (
    <div className="relative z-10 w-full max-w-[480px] glass-effect hilton-glass rounded-3xl shadow-soft overflow-hidden flex flex-col animate-fade-in hilton-outline">
      <div className="h-1.5 w-full bg-primary"></div>
      <div className="px-8 pt-8 pb-10 flex flex-col h-full">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="mb-5 text-primary">
            <span className="material-symbols-outlined text-4xl">travel_explore</span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl text-primary-dark font-medium tracking-tight mb-2">
            Welcome back
          </h1>
          <p className="text-medium-gray text-sm font-medium">
            Enter your details to retrieve your booking
          </p>
          <div className="hilton-gold-divider w-20 mt-5"></div>
        </div>

        <div className="space-y-5 mb-8">
          <div className="group relative">
            <label className="block text-xs font-semibold uppercase tracking-wider text-medium-gray mb-1.5 ml-1">
              Order ID
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-4 text-slate-400">tag</span>
              <input 
                type="text"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-light-gray border border-slate-200 rounded-xl text-charcoal focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                placeholder="e.g., 1002"
              />
            </div>
          </div>
          
          <div className="group relative">
            <label className="block text-xs font-semibold uppercase tracking-wider text-medium-gray mb-1.5 ml-1">
              Name
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-4 text-slate-400">person</span>
              <input 
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-light-gray border border-slate-200 rounded-xl text-charcoal focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                placeholder="Enter your name"
              />
            </div>
          </div>

          {error && <p className="text-red-500 text-xs mt-2 text-center">{error}</p>}
        </div>

        <button 
          onClick={handleFindBooking}
          className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 group hilton-sheen"
        >
          <span>Find Booking</span>
          <span className="material-symbols-outlined text-sm transition-transform duration-300 group-hover:translate-x-1">arrow_forward</span>
        </button>

        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-xs text-medium-gray">Try IDs: 1001 (Upcoming), 1002 (During), 1003 (Post)</p>
          <button onClick={debugTestSouvenir} className="text-[10px] text-primary underline opacity-60 hover:opacity-100">
             Debug: Test Souvenir Page (Trip Completed)
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginStep;
