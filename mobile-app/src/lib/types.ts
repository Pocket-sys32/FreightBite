export type LegStatus = 'OPEN' | 'ASSIGNED' | 'IN_TRANSIT' | 'COMPLETED' | 'SEARCHING';

export interface Driver {
  id: string;
  name: string;
  email: string;
  mcNumber: string;
  dotNumber: string;
  currentLat: number;
  currentLng: number;
  hosRemainingHours: number;
  hosCycleUsed: number;
  homeLat: number;
  homeLng: number;
  homeCity: string;
  currentCity: string;
  rating: number;
  totalLoads: number;
  trailerType: 'Dry Van' | 'Reefer' | 'Flatbed' | 'Step Deck';
  trailerLength: '48ft' | '53ft';
  eldProvider: string;
}

export interface Leg {
  id: string;
  loadId: string;
  sequence: number;
  origin: string;
  originState: string;
  originAddress: string;
  originLat?: number;
  originLng?: number;
  destination: string;
  destinationState: string;
  destinationAddress: string;
  destinationLat?: number;
  destinationLng?: number;
  miles: number;
  deadheadMiles: number;
  handoffPoint: string;
  handoffAddress: string;
  rateCents: number;
  ratePerMile: number;
  fuelSurchargeCents: number;
  status: LegStatus;
  driverId: string | null;
  driverName: string | null;
  estimatedPickup: string;
  estimatedDelivery: string;
  commodity: string;
  weight: number;
}

export interface BrokerContact {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  mcNumber: string;
  lastLoad: string;
  lastWorkedDate: string;
  totalLoads: number;
  avgRatePerMile: number;
  paymentTerms: string;
  preferredLanes: string[];
}

export interface LegEvent {
  id: string;
  legId: string;
  driverId: string | null;
  eventType: string;
  payload: unknown;
  createdAt: string | null;
}

export interface HandoffLink {
  id: string;
  fromLegId: string;
  toLegId: string;
  fromDriverId: string | null;
  toDriverId: string | null;
  status: 'PENDING' | 'READY' | 'COMPLETE';
  updatedAt: string | null;
}

export interface LegWorkflow {
  phase: string;
  latestEvent: LegEvent | null;
  events: LegEvent[];
  previousLeg: Leg | null;
  nextLeg: Leg | null;
  handoffs: HandoffLink[];
}

export interface DraftEmail {
  subject: string;
  body: string;
}

export interface OutreachUploadResult {
  filename: string;
  documentId: string | null;
  extracted: Record<string, unknown> | null;
  linked: {
    localContactCreated: boolean;
    companyId: string | null;
    contractId: string | null;
    contractContactId: string | null;
    ratesLinked: number;
  };
}
