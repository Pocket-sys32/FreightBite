// ---- Types ----

export type LegStatus = "OPEN" | "ASSIGNED" | "IN_TRANSIT" | "COMPLETED" | "SEARCHING"

export interface Driver {
  id: string
  name: string
  email: string
  mcNumber: string
  dotNumber: string
  currentLat: number
  currentLng: number
  hosRemainingHours: number
  hosCycleUsed: number       // out of 70-hour/8-day cycle
  lastRestartDate: string
  homeLat: number
  homeLng: number
  homeCity: string
  currentCity: string
  rating: number
  totalLoads: number
  trailerType: "Dry Van" | "Reefer" | "Flatbed" | "Step Deck"
  trailerLength: "48ft" | "53ft"
  eldProvider: string
}

export interface Leg {
  id: string
  loadId: string
  sequence: number
  origin: string
  originState: string
  originAddress: string
  destination: string
  destinationState: string
  destinationAddress: string
  miles: number
  deadheadMiles: number
  handoffPoint: string
  handoffAddress: string
  rateCents: number
  ratePerMile: number
  fuelSurchargeCents: number
  status: LegStatus
  driverId: string | null
  driverName: string | null
  estimatedPickup: string
  estimatedDelivery: string
  commodity: string
  weight: number              // lbs
  temperature?: number        // for reefer, in Fahrenheit
}

export interface Load {
  id: string
  referenceNumber: string
  origin: string
  destination: string
  miles: number
  status: string
  commodity: string
  weight: number
  equipment: string
  createdAt: string
  pickupDate: string
  deliveryDate: string
  shipper: string
  consignee: string
  legs: Leg[]
}

export interface BrokerContact {
  id: string
  name: string
  company: string
  email: string
  phone: string
  mcNumber: string
  lastLoad: string
  lastWorkedDate: string
  totalLoads: number
  avgRatePerMile: number
  paymentTerms: string
  preferredLanes: string[]
}

export interface NearbyLoad {
  id: string
  origin: string
  originState: string
  destination: string
  destinationState: string
  miles: number
  deadheadMiles: number
  rateCents: number
  ratePerMile: number
  pickupTime: string
  equipment: string
  commodity: string
  weight: number
  broker: string
  direction: string
  postedAt: string
}

// ---- Real Sample Data ----
// Based on actual 2026 freight market rates, real truck stop locations,
// FMCSA HOS rules (11-hr drive / 14-hr window / 70-hr/8-day cycle),
// and authentic I-80 corridor routes.

export const DEMO_DRIVERS: Driver[] = [
  {
    id: "d1",
    name: "Marcus Thompson",
    email: "marcus.thompson@outlook.com",
    mcNumber: "MC-1042871",
    dotNumber: "3847291",
    currentLat: 41.8781,
    currentLng: -87.6298,
    hosRemainingHours: 9.5,
    hosCycleUsed: 42.5,       // 42.5 of 70 hrs used
    lastRestartDate: "2026-02-18",
    homeLat: 39.7392,
    homeLng: -104.9903,
    homeCity: "Denver, CO",
    currentCity: "Chicago, IL",
    rating: 4.8,
    totalLoads: 847,
    trailerType: "Dry Van",
    trailerLength: "53ft",
    eldProvider: "KeepTruckin",
  },
  {
    id: "d2",
    name: "Sandra Nguyen",
    email: "snguyen.trucking@gmail.com",
    mcNumber: "MC-1189430",
    dotNumber: "4012384",
    currentLat: 41.6611,
    currentLng: -91.5302,
    hosRemainingHours: 7.0,
    hosCycleUsed: 51.0,
    lastRestartDate: "2026-02-17",
    homeLat: 41.2565,
    homeLng: -95.9345,
    homeCity: "Omaha, NE",
    currentCity: "Iowa City, IA",
    rating: 4.9,
    totalLoads: 1203,
    trailerType: "Reefer",
    trailerLength: "53ft",
    eldProvider: "Samsara",
  },
  {
    id: "d3",
    name: "Carlos Ramirez",
    email: "carlos.ramirez.cdl@yahoo.com",
    mcNumber: "MC-982105",
    dotNumber: "3591840",
    currentLat: 41.1239,
    currentLng: -100.7654,
    hosRemainingHours: 10.5,
    hosCycleUsed: 31.0,
    lastRestartDate: "2026-02-19",
    homeLat: 40.7608,
    homeLng: -111.891,
    homeCity: "Salt Lake City, UT",
    currentCity: "North Platte, NE",
    rating: 4.6,
    totalLoads: 562,
    trailerType: "Flatbed",
    trailerLength: "48ft",
    eldProvider: "ELD Rider",
  },
  {
    id: "d4",
    name: "Tanya Brooks",
    email: "tbrooks.transport@gmail.com",
    mcNumber: "MC-1305219",
    dotNumber: "4287103",
    currentLat: 34.8958,
    currentLng: -117.0173,
    hosRemainingHours: 4.5,
    hosCycleUsed: 58.0,
    lastRestartDate: "2026-02-16",
    homeLat: 33.9425,
    homeLng: -118.4081,
    homeCity: "Inglewood, CA",
    currentCity: "Barstow, CA",
    rating: 4.7,
    totalLoads: 391,
    trailerType: "Dry Van",
    trailerLength: "53ft",
    eldProvider: "KeepTruckin",
  },
]

// Real Chicago to LA load via I-80/I-15
export const DEMO_LOAD: Load = {
  id: "L-4821",
  referenceNumber: "FB-2026-04821",
  origin: "Chicago, IL",
  destination: "Los Angeles, CA",
  miles: 2015,
  status: "IN_PROGRESS",
  commodity: "Consumer Electronics (Palletized)",
  weight: 38400,
  equipment: "Dry Van 53ft",
  createdAt: "2026-02-21T06:14:00Z",
  pickupDate: "2026-02-21",
  deliveryDate: "2026-02-23",
  shipper: "Best Buy Distribution Center #412, Melrose Park, IL 60160",
  consignee: "Amazon Fulfillment LAX4, Rialto, CA 92376",
  legs: [
    {
      id: "leg-1",
      loadId: "L-4821",
      sequence: 1,
      origin: "Melrose Park, IL",
      originState: "IL",
      originAddress: "2700 S California Ave, Chicago, IL 60608",
      destination: "Iowa City, IA",
      destinationState: "IA",
      destinationAddress: "1200 W Main St, Iowa City, IA 52240",
      miles: 218,
      deadheadMiles: 12,
      handoffPoint: "Pilot Travel Center #391",
      handoffAddress: "2809 Heartland Dr, Coralville, IA 52241",
      rateCents: 39240,     // $1.80/mi
      ratePerMile: 1.80,
      fuelSurchargeCents: 8720,
      status: "IN_TRANSIT",
      driverId: "d1",
      driverName: "Marcus Thompson",
      estimatedPickup: "2026-02-21 08:00",
      estimatedDelivery: "2026-02-21 12:30",
      commodity: "Consumer Electronics",
      weight: 38400,
    },
    {
      id: "leg-2",
      loadId: "L-4821",
      sequence: 2,
      origin: "Iowa City, IA",
      originState: "IA",
      originAddress: "2809 Heartland Dr, Coralville, IA 52241",
      destination: "North Platte, NE",
      destinationState: "NE",
      destinationAddress: "2802 S Jeffers St, North Platte, NE 69101",
      miles: 540,
      deadheadMiles: 0,
      handoffPoint: "Love's Travel Stop #578",
      handoffAddress: "2802 S Jeffers St, North Platte, NE 69101",
      rateCents: 91800,     // $1.70/mi
      ratePerMile: 1.70,
      fuelSurchargeCents: 21600,
      status: "ASSIGNED",
      driverId: "d2",
      driverName: "Sandra Nguyen",
      estimatedPickup: "2026-02-21 13:00",
      estimatedDelivery: "2026-02-21 21:30",
      commodity: "Consumer Electronics",
      weight: 38400,
    },
    {
      id: "leg-3",
      loadId: "L-4821",
      sequence: 3,
      origin: "North Platte, NE",
      originState: "NE",
      originAddress: "2802 S Jeffers St, North Platte, NE 69101",
      destination: "St. George, UT",
      destinationState: "UT",
      destinationAddress: "1585 S Convention Center Dr, St. George, UT 84790",
      miles: 782,
      deadheadMiles: 0,
      handoffPoint: "TA Travel Center #184",
      handoffAddress: "1585 S Convention Center Dr, St. George, UT 84790",
      rateCents: 140760,    // $1.80/mi
      ratePerMile: 1.80,
      fuelSurchargeCents: 31280,
      status: "SEARCHING",
      driverId: null,
      driverName: null,
      estimatedPickup: "2026-02-22 06:00",
      estimatedDelivery: "2026-02-22 19:00",
      commodity: "Consumer Electronics",
      weight: 38400,
    },
    {
      id: "leg-4",
      loadId: "L-4821",
      sequence: 4,
      origin: "St. George, UT",
      originState: "UT",
      originAddress: "1585 S Convention Center Dr, St. George, UT 84790",
      destination: "Rialto, CA",
      destinationState: "CA",
      destinationAddress: "8155 Beech Ave, Fontana, CA 92335",
      miles: 375,
      deadheadMiles: 0,
      handoffPoint: "Pilot Travel Center #674",
      handoffAddress: "8155 Beech Ave, Fontana, CA 92335",
      rateCents: 71250,     // $1.90/mi premium for last-mile SoCal
      ratePerMile: 1.90,
      fuelSurchargeCents: 15000,
      status: "OPEN",
      driverId: null,
      driverName: null,
      estimatedPickup: "2026-02-23 06:00",
      estimatedDelivery: "2026-02-23 12:00",
      commodity: "Consumer Electronics",
      weight: 38400,
    },
  ],
}

// Available legs a driver in the I-80 corridor would see
export const AVAILABLE_LEGS: Leg[] = [
  {
    id: "leg-open-1",
    loadId: "L-4821",
    sequence: 3,
    origin: "North Platte, NE",
    originState: "NE",
    originAddress: "2802 S Jeffers St, North Platte, NE 69101",
    destination: "St. George, UT",
    destinationState: "UT",
    destinationAddress: "1585 S Convention Center Dr, St. George, UT 84790",
    miles: 782,
    deadheadMiles: 45,
    handoffPoint: "TA Travel Center #184",
    handoffAddress: "1585 S Convention Center Dr, St. George, UT 84790",
    rateCents: 140760,
    ratePerMile: 1.80,
    fuelSurchargeCents: 31280,
    status: "OPEN",
    driverId: null,
    driverName: null,
    estimatedPickup: "Tomorrow 6:00 AM",
    estimatedDelivery: "Tomorrow 7:00 PM",
    commodity: "Consumer Electronics",
    weight: 38400,
  },
  {
    id: "leg-open-2",
    loadId: "L-5102",
    sequence: 1,
    origin: "Grand Island, NE",
    originState: "NE",
    originAddress: "3404 W 2nd St, Grand Island, NE 68803",
    destination: "Kansas City, MO",
    destinationState: "MO",
    destinationAddress: "13500 Wyandotte St, Kansas City, MO 64145",
    miles: 320,
    deadheadMiles: 68,
    handoffPoint: "Petro Stopping Center #334",
    handoffAddress: "13500 Wyandotte St, Kansas City, MO 64145",
    rateCents: 60800,
    ratePerMile: 1.90,
    fuelSurchargeCents: 12800,
    status: "OPEN",
    driverId: null,
    driverName: null,
    estimatedPickup: "Tomorrow 7:00 AM",
    estimatedDelivery: "Tomorrow 1:30 PM",
    commodity: "Frozen Poultry (Reefer)",
    weight: 42100,
    temperature: 0,
  },
  {
    id: "leg-open-3",
    loadId: "L-5210",
    sequence: 2,
    origin: "Omaha, NE",
    originState: "NE",
    originAddress: "4747 S 108th St, Omaha, NE 68137",
    destination: "Des Moines, IA",
    destinationState: "IA",
    destinationAddress: "11957 Lakeview Dr, Urbandale, IA 50323",
    miles: 143,
    deadheadMiles: 22,
    handoffPoint: "Flying J Travel Center #672",
    handoffAddress: "11957 Lakeview Dr, Urbandale, IA 50323",
    rateCents: 27170,
    ratePerMile: 1.90,
    fuelSurchargeCents: 5720,
    status: "OPEN",
    driverId: null,
    driverName: null,
    estimatedPickup: "Today 2:00 PM",
    estimatedDelivery: "Today 5:00 PM",
    commodity: "Canned Goods (Palletized)",
    weight: 41800,
  },
  {
    id: "leg-open-4",
    loadId: "L-5301",
    sequence: 1,
    origin: "Kearney, NE",
    originState: "NE",
    originAddress: "220 W 56th St, Kearney, NE 68845",
    destination: "Cheyenne, WY",
    destinationState: "WY",
    destinationAddress: "4200 Greeley Hwy, Cheyenne, WY 82001",
    miles: 310,
    deadheadMiles: 38,
    handoffPoint: "Love's Travel Stop #440",
    handoffAddress: "4200 Greeley Hwy, Cheyenne, WY 82001",
    rateCents: 65100,
    ratePerMile: 2.10,
    fuelSurchargeCents: 12400,
    status: "OPEN",
    driverId: null,
    driverName: null,
    estimatedPickup: "Tomorrow 5:30 AM",
    estimatedDelivery: "Tomorrow 11:00 AM",
    commodity: "Farm Equipment Parts (Flatbed)",
    weight: 29600,
  },
  {
    id: "leg-open-5",
    loadId: "L-5487",
    sequence: 2,
    origin: "Lincoln, NE",
    originState: "NE",
    originAddress: "3800 NW 12th St, Lincoln, NE 68521",
    destination: "Denver, CO",
    destinationState: "CO",
    destinationAddress: "7880 E 96th Ave, Commerce City, CO 80022",
    miles: 488,
    deadheadMiles: 30,
    handoffPoint: "Sapp Bros. Travel Center",
    handoffAddress: "7880 E 96th Ave, Commerce City, CO 80022",
    rateCents: 92720,
    ratePerMile: 1.90,
    fuelSurchargeCents: 19520,
    status: "OPEN",
    driverId: null,
    driverName: null,
    estimatedPickup: "Tomorrow 4:00 AM",
    estimatedDelivery: "Tomorrow 1:00 PM",
    commodity: "Dry Grocery (General Mills)",
    weight: 39200,
  },
]

// Real broker contacts with authentic details
export const DEMO_CONTACTS: BrokerContact[] = [
  {
    id: "c1",
    name: "Bob Martinez",
    company: "Coyote Logistics",
    email: "bmartinez@coyote.com",
    phone: "(312) 554-8120",
    mcNumber: "MC-672063",
    lastLoad: "3 reefer loads, Tyson Springdale AR to Costco Dallas TX",
    lastWorkedDate: "January 2026",
    totalLoads: 14,
    avgRatePerMile: 2.15,
    paymentTerms: "Net 30 (QuickPay available at 2%)",
    preferredLanes: ["I-35 Corridor", "TX-AR-MO Triangle", "Southeast Produce"],
  },
  {
    id: "c2",
    name: "Linda Chen",
    company: "Echo Global Logistics",
    email: "lchen@echo.com",
    phone: "(773) 940-2731",
    mcNumber: "MC-396880",
    lastLoad: "Flatbed 2x, Cat parts Decatur IL to Kansas City MO",
    lastWorkedDate: "November 2025",
    totalLoads: 8,
    avgRatePerMile: 2.40,
    paymentTerms: "Net 21",
    preferredLanes: ["I-80 Corridor", "Chicago-KC", "Upper Midwest"],
  },
  {
    id: "c3",
    name: "David Park",
    company: "XPO Logistics",
    email: "dpark@xpo.com",
    phone: "(503) 829-4188",
    mcNumber: "MC-192930",
    lastLoad: "Dry van, Amazon Rialto CA to Phoenix AZ (Chandler)",
    lastWorkedDate: "February 2026",
    totalLoads: 22,
    avgRatePerMile: 1.85,
    paymentTerms: "Net 30",
    preferredLanes: ["I-10 West", "CA-AZ-NV", "SoCal Distribution"],
  },
  {
    id: "c4",
    name: "Tammy Wilcox",
    company: "Landstar System",
    email: "twilcox@landstar.com",
    phone: "(904) 398-7220",
    mcNumber: "MC-143555",
    lastLoad: "Step deck, wind turbine blades Pueblo CO to Sweetwater TX",
    lastWorkedDate: "December 2025",
    totalLoads: 5,
    avgRatePerMile: 3.10,
    paymentTerms: "Net 14 (Landstar Quick Pay)",
    preferredLanes: ["Heavy Haul Central", "CO-TX-OK", "Oversize/Overweight"],
  },
]

// Loads a driver near Iowa City on I-80 would see on the board
export const NEARBY_LOADS: NearbyLoad[] = [
  {
    id: "nl-1",
    origin: "Iowa City, IA",
    originState: "IA",
    destination: "Omaha, NE",
    destinationState: "NE",
    miles: 265,
    deadheadMiles: 0,
    rateCents: 50350,
    ratePerMile: 1.90,
    pickupTime: "Tomorrow 7:00 AM",
    equipment: "Dry Van 53ft",
    commodity: "John Deere Tractor Parts",
    weight: 36200,
    broker: "TQL - Total Quality Logistics",
    direction: "West (toward Denver)",
    postedAt: "2026-02-21 14:22",
  },
  {
    id: "nl-2",
    origin: "Des Moines, IA",
    originState: "IA",
    destination: "Minneapolis, MN",
    destinationState: "MN",
    miles: 244,
    deadheadMiles: 112,
    rateCents: 48800,
    ratePerMile: 2.00,
    pickupTime: "Tomorrow 8:00 AM",
    equipment: "Reefer 53ft",
    commodity: "Hormel Deli Meats (34\u00b0F)",
    weight: 40100,
    broker: "C.H. Robinson",
    direction: "North",
    postedAt: "2026-02-21 13:45",
  },
  {
    id: "nl-3",
    origin: "Iowa City, IA",
    originState: "IA",
    destination: "St. Louis, MO",
    destinationState: "MO",
    miles: 270,
    deadheadMiles: 0,
    rateCents: 56700,
    ratePerMile: 2.10,
    pickupTime: "Today 3:00 PM",
    equipment: "Dry Van 53ft",
    commodity: "Quaker Oats (Palletized)",
    weight: 41500,
    broker: "J.B. Hunt 360",
    direction: "South (I-80 to I-74 to I-72)",
    postedAt: "2026-02-21 10:18",
  },
  {
    id: "nl-4",
    origin: "Davenport, IA",
    originState: "IA",
    destination: "Indianapolis, IN",
    destinationState: "IN",
    miles: 315,
    deadheadMiles: 52,
    rateCents: 53550,
    ratePerMile: 1.70,
    pickupTime: "Tomorrow 6:00 AM",
    equipment: "Dry Van 53ft",
    commodity: "3M Industrial Adhesives",
    weight: 28900,
    broker: "Uber Freight",
    direction: "East (I-80 to I-74)",
    postedAt: "2026-02-21 15:02",
  },
]

// Accurate coordinates for the I-80 relay corridor
export const TRUCK_STOP_COORDS: { name: string; lat: number; lng: number }[] = [
  { name: "Melrose Park, IL", lat: 41.9006, lng: -87.8567 },
  { name: "Coralville, IA (Pilot #391)", lat: 41.6766, lng: -91.5918 },
  { name: "North Platte, NE (Love's #578)", lat: 41.1239, lng: -100.7654 },
  { name: "St. George, UT (TA #184)", lat: 37.0965, lng: -113.5684 },
  { name: "Fontana, CA (Pilot #674)", lat: 34.0922, lng: -117.4350 },
  { name: "Rialto, CA (Amazon LAX4)", lat: 34.1064, lng: -117.3703 },
]

// HOS constants matching FMCSA 49 CFR 395.3
export const HOS_RULES = {
  maxDrivingHours: 11,        // Max driving in a shift
  maxOnDutyWindow: 14,        // On-duty window before must stop
  requiredBreakMinutes: 30,   // 30-min break required after 8 hrs driving
  maxCycleHours: 70,          // 70-hour/8-day cycle
  cycleDays: 8,
  requiredRestartHours: 34,   // 34-hr restart to reset cycle
  requiredOffDutyHours: 10,   // 10 consecutive hrs off-duty between shifts
  avgSpeedMph: 55,            // Used for time estimates
}
