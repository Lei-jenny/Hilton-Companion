import React, { useState } from 'react';
import LoginStep from './components/LoginStep';
import DashboardStep from './components/DashboardStep';
import SouvenirStep from './components/SouvenirStep';
import { UserSession, TripStatus } from './types';

const App: React.FC = () => {
  const [session, setSession] = useState<UserSession | null>(null);

  const handleLoginSuccess = (userSession: UserSession) => {
    setSession(userSession);
  };

  // Render logic based on session status
  const renderStep = () => {
    if (!session) {
      return <LoginStep onLoginSuccess={handleLoginSuccess} />;
    }

    switch (session.status) {
      case TripStatus.UPCOMING:
        // For MVP, treating upcoming similar to Dashboard but maybe restricted, 
        // or for this demo, just let them see the dashboard to explore.
        // Or we could show a "Countdown" screen. 
        // Let's reuse Dashboard but maybe with a future tense greeting.
        return <DashboardStep session={session} />;
      
      case TripStatus.DURING_STAY:
        return <DashboardStep session={session} />;
      
      case TripStatus.COMPLETED:
        return <SouvenirStep session={session} />;
      
      default:
        return <LoginStep onLoginSuccess={handleLoginSuccess} />;
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden p-0 sm:p-6 lg:p-8 bg-background-light">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0 overflow-hidden bg-primary-dark">
         <img 
            alt="Background" 
            className="w-full h-full object-cover opacity-50 scale-105 blur-[2px] transition-transform duration-[20s] ease-linear hover:scale-110" 
            src={session?.booking.backgroundImage || "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?q=80&w=2070&auto=format&fit=crop"} 
         />
         <div className="absolute inset-0 bg-primary-dark/60 mix-blend-multiply"></div>
      </div>
      <div className="absolute inset-0 z-0 pointer-events-none hilton-tech-grid"></div>

      {renderStep()}
    </div>
  );
};

export default App;
