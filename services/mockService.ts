import { Booking, TripStatus, Attraction } from '../types';

// Helper to get date string relative to today
const getRelativeDate = (daysOffset: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split('T')[0];
};

export const MOCK_BOOKINGS: Record<string, Booking> = {
  '1001': {
    orderId: '1001',
    guestName: 'Smith',
    firstName: 'John',
    hotelName: 'Hilton London Metropole',
    location: 'London, UK',
    checkInDate: getRelativeDate(5), // Upcoming
    checkOutDate: getRelativeDate(10),
    backgroundImage: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?q=80&w=2070&auto=format&fit=crop'
  },
  '1002': {
    orderId: '1002',
    guestName: 'Anderson', // Kept for record, but ignored in validation
    firstName: 'Anderson',
    hotelName: 'Waldorf Astoria Shanghai Qiantan',
    location: 'Shanghai, China',
    checkInDate: getRelativeDate(-2), // During stay
    checkOutDate: getRelativeDate(2),
    backgroundImage: 'https://images.unsplash.com/photo-1548919973-5cef591cdbc9?q=80&w=2070&auto=format&fit=crop'
  },
  '1003': {
    orderId: '1003',
    guestName: 'Doe',
    firstName: 'Jane',
    hotelName: 'Waldorf Astoria Maldives',
    location: 'Ithaafushi, Maldives',
    checkInDate: getRelativeDate(-10), // Completed
    checkOutDate: getRelativeDate(-5),
    backgroundImage: 'https://images.unsplash.com/photo-1573843981267-be1999ff37cd?q=80&w=1974&auto=format&fit=crop'
  },
  '1004': {
    orderId: '1004',
    guestName: 'Lee',
    firstName: 'David',
    hotelName: 'Conrad Chongqing',
    location: 'Chongqing, China',
    checkInDate: getRelativeDate(15), // Upcoming (Future)
    checkOutDate: getRelativeDate(20),
    backgroundImage: 'https://images.unsplash.com/photo-1534234828569-1d227f4d2b28?q=80&w=2070&auto=format&fit=crop' // Cyberpunk City Vibe
  },
  '1005': {
    orderId: '1005',
    guestName: 'Tanaka',
    firstName: 'Kenji',
    hotelName: 'Conrad Tokyo',
    location: 'Tokyo, Japan',
    checkInDate: getRelativeDate(1), // Tomorrow
    checkOutDate: getRelativeDate(5),
    backgroundImage: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?q=80&w=2094&auto=format&fit=crop' // Tokyo Tower / City
  }
};

export const validateUser = (orderId: string, lastName: string): Booking | null => {
  const booking = MOCK_BOOKINGS[orderId];
  if (booking) {
    return booking;
  }
  return null;
};

export const getTripStatus = (booking: Booking): TripStatus => {
  const now = new Date();
  const checkIn = new Date(booking.checkInDate);
  const checkOut = new Date(booking.checkOutDate);

  now.setHours(0, 0, 0, 0);
  checkIn.setHours(0, 0, 0, 0);
  checkOut.setHours(0, 0, 0, 0);

  if (now < checkIn) {
    return TripStatus.UPCOMING;
  } else if (now >= checkIn && now <= checkOut) {
    return TripStatus.DURING_STAY;
  } else {
    return TripStatus.COMPLETED;
  }
};

export const MOCK_ATTRACTIONS: Record<string, Attraction[]> = {
  // --- LONDON (1001) ---
  '1001': [
    {
      id: 101,
      name: 'Hyde Park',
      type: 'Park',
      category: 'Nearby',
      icon: 'park',
      description: 'Massive green space right at your doorstep.',
      coordinates: { top: '30%', left: '20%' },
      imageUrl: ''
    },
    {
      id: 102,
      name: 'Paddington Basin',
      type: 'Canal',
      category: 'Nearby',
      icon: 'water',
      description: 'Modern waterside dining and boat trips.',
      coordinates: { bottom: '30%', right: '25%' },
      imageUrl: ''
    },
    {
      id: 103,
      name: 'Oxford Street',
      type: 'Shopping',
      category: 'Nearby',
      icon: 'shopping_bag',
      description: 'Europe\'s busiest shopping street.',
      coordinates: { top: '20%', right: '15%' },
      imageUrl: ''
    },
    {
      id: 104,
      name: 'London Eye',
      type: 'Landmark',
      category: 'Must-See',
      icon: 'attractions',
      description: 'Observation wheel on the South Bank.',
      coordinates: { top: '10%', left: '10%' },
      imageUrl: ''
    },
    {
      id: 105,
      name: 'Big Ben',
      type: 'Landmark',
      category: 'Must-See',
      icon: 'schedule',
      description: 'The Great Bell of the striking clock.',
      coordinates: { top: '5%', right: '5%' },
      imageUrl: ''
    },
    {
      id: 106,
      name: 'British Museum',
      type: 'Culture',
      category: 'Must-See',
      icon: 'museum',
      description: 'Human history, art and culture.',
      coordinates: { bottom: '10%', right: '10%' },
      imageUrl: ''
    }
  ],

  // --- SHANGHAI (1002) ---
  '1002': [
    {
      id: 1,
      name: 'Qiantan Taikoo Li',
      type: 'Luxury Shopping',
      category: 'Nearby',
      icon: 'shopping_bag',
      description: 'Open-plan wellness-themed retail complex.',
      coordinates: { top: '30%', left: '20%' },
      imageUrl: ''
    },
    {
      id: 2,
      name: 'Oriental Sports Center',
      type: 'Arena',
      category: 'Nearby',
      icon: 'stadium',
      description: 'Iconic sporting venue also known as the "Sea Crown".',
      coordinates: { bottom: '30%', right: '25%' },
      imageUrl: ''
    },
    {
      id: 3,
      name: 'West Bund Art Center',
      type: 'Art Gallery',
      category: 'Nearby',
      icon: 'palette',
      description: 'Contemporary art exhibitions.',
      coordinates: { top: '20%', right: '15%' },
      imageUrl: ''
    },
    {
      id: 4,
      name: 'The Bund',
      type: 'Waterfront',
      category: 'Must-See',
      icon: 'camera_alt',
      description: 'Famous waterfront promenade.',
      coordinates: { top: '10%', left: '10%' },
      imageUrl: ''
    },
    {
      id: 5,
      name: 'Shanghai Tower',
      type: 'Skyscraper',
      category: 'Must-See',
      icon: 'visibility',
      description: 'Tallest building in China.',
      coordinates: { top: '5%', right: '5%' },
      imageUrl: ''
    },
    {
      id: 6,
      name: 'Yu Garden',
      type: 'Classical Garden',
      category: 'Must-See',
      icon: 'temple_buddhist',
      description: 'Classical Chinese garden.',
      coordinates: { bottom: '10%', right: '10%' },
      imageUrl: ''
    }
  ],

  // --- MALDIVES (1003) ---
  '1003': [
    {
      id: 201,
      name: 'House Reef',
      type: 'Nature',
      category: 'Nearby',
      icon: 'scuba_diving',
      description: 'Vibrant coral reef teeming with marine life.',
      coordinates: { top: '30%', left: '20%' },
      imageUrl: ''
    },
    {
      id: 202,
      name: 'Sunset Bar',
      type: 'Dining',
      category: 'Nearby',
      icon: 'cocktail_bell',
      description: 'Overwater bar with perfect sunset views.',
      coordinates: { bottom: '30%', right: '25%' },
      imageUrl: ''
    },
    {
      id: 203,
      name: 'Aqua Wellness',
      type: 'Spa',
      category: 'Nearby',
      icon: 'spa',
      description: 'Hydrotherapy pool.',
      coordinates: { top: '20%', right: '15%' },
      imageUrl: ''
    },
    {
      id: 204,
      name: 'Male City Tour',
      type: 'Culture',
      category: 'Must-See',
      icon: 'location_city',
      description: 'The capital city of Maldives.',
      coordinates: { top: '10%', left: '10%' },
      imageUrl: ''
    },
    {
      id: 205,
      name: 'Sandbank Picnic',
      type: 'Adventure',
      category: 'Must-See',
      icon: 'umbrella',
      description: 'Private picnic on a secluded sandbank.',
      coordinates: { top: '5%', right: '5%' },
      imageUrl: ''
    },
    {
      id: 206,
      name: 'Dolphin Cruise',
      type: 'Wildlife',
      category: 'Must-See',
      icon: 'sailing',
      description: 'Sunset cruise to spot dolphins.',
      coordinates: { bottom: '10%', right: '10%' },
      imageUrl: ''
    }
  ],

  // --- CHONGQING (1004) ---
  '1004': [
    {
      id: 301,
      name: 'Jiefangbei Square',
      type: 'Shopping',
      category: 'Nearby',
      icon: 'shopping_bag',
      description: 'The central business district and heart of Chongqing.',
      coordinates: { top: '30%', left: '20%' },
      imageUrl: ''
    },
    {
      id: 302,
      name: 'Hongya Cave',
      type: 'Landmark',
      category: 'Must-See',
      icon: 'castle',
      description: 'Stunning stilt house complex lit up at night.',
      coordinates: { bottom: '30%', right: '25%' },
      imageUrl: ''
    },
    {
      id: 303,
      name: 'Spicy Hot Pot',
      type: 'Dining',
      category: 'Nearby',
      icon: 'restaurant',
      description: 'Authentic Chongqing mala hot pot experience.',
      coordinates: { top: '20%', right: '15%' },
      imageUrl: ''
    },
    {
      id: 304,
      name: 'Liziba Station',
      type: 'Transport',
      category: 'Must-See',
      icon: 'train',
      description: 'Famous light rail train passing through a building.',
      coordinates: { top: '10%', left: '10%' },
      imageUrl: ''
    },
    {
      id: 305,
      name: 'Yangtze River Cableway',
      type: 'Adventure',
      category: 'Must-See',
      icon: 'cable_car',
      description: 'Scenic ride across the Yangtze River.',
      coordinates: { top: '5%', right: '5%' },
      imageUrl: ''
    },
    {
      id: 306,
      name: 'Raffles City',
      type: 'Architecture',
      category: 'Nearby',
      icon: 'apartment',
      description: 'Futuristic skyscraper complex at the river confluence.',
      coordinates: { bottom: '10%', right: '10%' },
      imageUrl: ''
    }
  ]
  // 1005 IS INTENTIONALLY LEFT EMPTY TO TEST DYNAMIC GENERATION
};

// Preset Avatars - High Quality 3D/Cartoon Style
export const PRESET_AVATARS = [
  'https://img.freepik.com/free-psd/3d-illustration-person-with-sunglasses_23-2149436188.jpg',
  'https://img.freepik.com/free-psd/3d-illustration-person-with-pink-hair_23-2149436186.jpg',
  'https://img.freepik.com/free-psd/3d-illustration-person-with-glasses_23-2149436191.jpg',
  'https://img.freepik.com/free-psd/3d-illustration-person_23-2149436192.jpg',
];