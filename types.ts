export enum TravelStyle {
  BUSINESS = 'Business',
  FAMILY = 'Family',
  SOLO = 'Solo',
  LUXURY = 'Luxury'
}

export enum TripStatus {
  UPCOMING = 'UPCOMING',
  DURING_STAY = 'DURING_STAY',
  COMPLETED = 'COMPLETED'
}

export interface Booking {
  orderId: string;
  guestName: string; // Last name for login
  firstName: string; // For display
  hotelName: string;
  location: string;
  checkInDate: string; // ISO Date string
  checkOutDate: string; // ISO Date string
  backgroundImage: string;
}

export interface UserSession {
  booking: Booking;
  travelStyle: TravelStyle;
  status: TripStatus;
  generatedAvatar?: string;
}

export interface Attraction {
  id: number;
  name: string;
  type: string;
  category: 'Nearby' | 'Must-See';
  icon: string;
  description: string;
  coordinates: { top?: string; left?: string; bottom?: string; right?: string }; // For absolute positioning on the static map
  imageUrl: string;
}