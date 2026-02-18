import { create } from 'zustand';

export type TaskStatus = 'pending' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type VehicleType = 'car' | 'electric';
export type VehicleStatus = 'available' | 'in_use' | 'maintenance';
export type TransportStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type RecurrenceType = 'none' | 'daily' | 'weekdays' | 'weekly';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  phone?: string;
  avatar?: string;
  color: string;
  schedule?: WorkSchedule[];
}

export interface WorkSchedule {
  date: string;
  startTime: string;
  endTime: string;
  note?: string;
}

export interface VehicleLog {
  id: string;
  userId: string;
  pickupDate: string;
  pickupKm: number;
  pickupTime?: string;
  returnDate?: string;
  returnKm?: number;
  returnTime?: string;
  note?: string;
}

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  type: VehicleType;
  status: VehicleStatus;
  assignedTo?: string;
  currentLocation?: string;
  currentKm?: number;
  logs: VehicleLog[];
}

export interface Transport {
  id: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  guestRole?: string;
  guestAgenda?: string;
  from: string;
  to: string;
  dateTime: string;
  vehicleId?: string;
  driverId?: string;
  status: TransportStatus;
  notes?: string;
  isVIP?: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  date: string;
  time?: string;
  recurrence: RecurrenceType;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo?: string;
  completedAt?: string;
  completedBy?: string;
  category: 'logistics' | 'reception' | 'transport' | 'general';
}

export interface AgendaEvent {
  id: string;
  title: string;
  description?: string;
  date: string;
  startTime: string;
  endTime: string;
  location?: string;
  category: string;
  isVIP?: boolean;
  source?: 'manual' | 'google';
}

export interface Guest {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role?: string;
  hotel?: string;
  roomNumber?: string;
  checkinDate?: string;
  checkinTime?: string;
  checkoutDate?: string;
  checkoutTime?: string;
  notes?: string;
  isVIP?: boolean;
}

const TEAM_COLORS = [
  'hsl(142, 50%, 35%)', 'hsl(38, 85%, 50%)', 'hsl(152, 55%, 40%)',
  'hsl(280, 50%, 50%)', 'hsl(340, 60%, 50%)', 'hsl(210, 65%, 50%)',
  'hsl(160, 55%, 35%)', 'hsl(20, 70%, 50%)', 'hsl(260, 45%, 50%)',
  'hsl(0, 65%, 50%)',
];

const today = new Date().toISOString().split('T')[0];
const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

const initialTeam: TeamMember[] = [
  { id: '1', name: 'Ana Silva', role: 'Coordenadora Geral', phone: '(55) 99999-0001', color: TEAM_COLORS[0] },
  { id: '2', name: 'Carlos Santos', role: 'Motorista', phone: '(55) 99999-0002', color: TEAM_COLORS[1] },
  { id: '3', name: 'Maria Oliveira', role: 'Recepção VIP', phone: '(55) 99999-0003', color: TEAM_COLORS[2] },
  { id: '4', name: 'Pedro Costa', role: 'Motorista', phone: '(55) 99999-0004', color: TEAM_COLORS[3] },
  { id: '5', name: 'Julia Ferreira', role: 'Logística', phone: '(55) 99999-0005', color: TEAM_COLORS[4] },
  { id: '6', name: 'Lucas Almeida', role: 'Motorista', phone: '(55) 99999-0006', color: TEAM_COLORS[5] },
  { id: '7', name: 'Beatriz Lima', role: 'Recepção', phone: '(55) 99999-0007', color: TEAM_COLORS[6] },
  { id: '8', name: 'Rafael Souza', role: 'Logística', phone: '(55) 99999-0008', color: TEAM_COLORS[7] },
  { id: '9', name: 'Camila Rocha', role: 'Assistente', phone: '(55) 99999-0009', color: TEAM_COLORS[8] },
  { id: '10', name: 'Fernando Dias', role: 'Motorista', phone: '(55) 99999-0010', color: TEAM_COLORS[9] },
];

const initialVehicles: Vehicle[] = [
  { id: 'v1', name: 'Sedan Executivo', plate: 'ABC-1234', type: 'car', status: 'available', currentKm: 45230, logs: [] },
  { id: 'v2', name: 'SUV Premium', plate: 'DEF-5678', type: 'car', status: 'in_use', assignedTo: '2', currentLocation: 'Aeroporto', currentKm: 32100, logs: [{ id: 'l1', userId: '2', pickupDate: `${today}T08:00`, pickupKm: 32050 }] },
  { id: 'v3', name: 'Carrinho Elétrico 01', plate: 'ELE-0001', type: 'electric', status: 'available', currentKm: 1200, logs: [] },
  { id: 'v4', name: 'Carrinho Elétrico 02', plate: 'ELE-0002', type: 'electric', status: 'in_use', assignedTo: '4', currentLocation: 'Hotel Central', currentKm: 980, logs: [{ id: 'l2', userId: '4', pickupDate: `${today}T09:00`, pickupKm: 950 }] },
  { id: 'v5', name: 'Van Executiva', plate: 'GHI-9012', type: 'car', status: 'available', currentKm: 67800, logs: [] },
  { id: 'v6', name: 'Carrinho Elétrico 03', plate: 'ELE-0003', type: 'electric', status: 'maintenance', currentKm: 2100, logs: [] },
];

const initialTransports: Transport[] = [
  { id: 't1', guestName: 'Dr. Roberto Mendes', guestPhone: '(11) 99999-1234', guestEmail: 'roberto@email.com', guestRole: 'Palestrante', guestAgenda: 'Painel Sustentabilidade 10:30, Almoço VIP 12:30', from: 'Aeroporto GRU', to: 'Hotel Fasano', dateTime: `${today}T14:00`, vehicleId: 'v2', driverId: '2', status: 'in_progress', isVIP: true },
  { id: 't2', guestName: 'Delegação Japão (5 pax)', guestRole: 'Delegação Internacional', from: 'Hotel Hilton', to: 'Centro de Convenções', dateTime: `${today}T09:00`, vehicleId: 'v5', driverId: '6', status: 'completed' },
  { id: 't3', guestName: 'Sra. Elena Vasquez', guestPhone: '(51) 98888-5678', guestRole: 'Expositora', from: 'Rodoviária', to: 'Hotel Ibis', dateTime: `${today}T16:30`, status: 'scheduled', isVIP: false },
  { id: 't4', guestName: 'Min. Paulo Guedes', guestPhone: '(61) 97777-0000', guestEmail: 'assessoria@gov.br', guestRole: 'Autoridade', guestAgenda: 'Recepção 08:00, Mesa Redonda 09:30', from: 'Aeroporto Congonhas', to: 'Hotel Fasano', dateTime: `${tomorrow}T08:00`, vehicleId: 'v1', driverId: '4', status: 'scheduled', isVIP: true },
];

const initialTasks: Task[] = [
  { id: 'tk1', title: 'Verificar carregamento dos veículos elétricos', date: tomorrow, status: 'pending', priority: 'high', assignedTo: '5', category: 'logistics', recurrence: 'daily', time: '07:00' },
  { id: 'tk2', title: 'Preparar kits de boas-vindas VIP', date: tomorrow, status: 'pending', priority: 'urgent', assignedTo: '3', category: 'reception', recurrence: 'none', time: '08:00' },
  { id: 'tk3', title: 'Confirmar reservas de hotel', date: today, status: 'done', priority: 'high', assignedTo: '9', category: 'general', completedAt: `${today}T10:30`, completedBy: '9', recurrence: 'none' },
  { id: 'tk4', title: 'Revisar rota aeroporto-hotel', date: tomorrow, status: 'pending', priority: 'medium', assignedTo: '2', category: 'transport', recurrence: 'none', time: '06:30' },
  { id: 'tk5', title: 'Testar Wi-Fi no centro de convenções', date: today, status: 'in_progress', priority: 'medium', assignedTo: '8', category: 'logistics', recurrence: 'none' },
  { id: 'tk6', title: 'Organizar credenciais de acesso', date: tomorrow, status: 'pending', priority: 'high', assignedTo: '7', category: 'reception', recurrence: 'daily', time: '07:30' },
];

const initialEvents: AgendaEvent[] = [
  { id: 'e1', title: 'Abertura Oficial da Feira', date: today, startTime: '09:00', endTime: '10:00', location: 'Auditório Principal', category: 'cerimônia', isVIP: true, source: 'manual' },
  { id: 'e2', title: 'Painel: Sustentabilidade nos Negócios', date: today, startTime: '10:30', endTime: '12:00', location: 'Sala 1', category: 'painel', source: 'manual' },
  { id: 'e3', title: 'Almoço VIP', date: today, startTime: '12:30', endTime: '14:00', location: 'Restaurante Rooftop', category: 'refeição', isVIP: true, source: 'manual' },
  { id: 'e4', title: 'Workshop: Mobilidade Elétrica', date: today, startTime: '14:30', endTime: '16:00', location: 'Sala 3', category: 'workshop', source: 'manual' },
  { id: 'e5', title: 'Recepção de Boas-Vindas', date: tomorrow, startTime: '08:00', endTime: '09:00', location: 'Lobby Hotel Fasano', category: 'recepção', isVIP: true, source: 'manual' },
  { id: 'e6', title: 'Mesa Redonda: Exportação', date: tomorrow, startTime: '09:30', endTime: '11:30', location: 'Sala 2', category: 'painel', source: 'manual' },
];

const initialGuests: Guest[] = [
  { id: 'g1', name: 'Dr. Roberto Mendes', phone: '(11) 99999-1234', email: 'roberto@email.com', role: 'Palestrante', hotel: 'Hotel Fasano', checkinDate: today, checkinTime: '15:00', checkoutDate: tomorrow, checkoutTime: '12:00', isVIP: true },
  { id: 'g2', name: 'Min. Paulo Guedes', phone: '(61) 97777-0000', email: 'assessoria@gov.br', role: 'Autoridade', hotel: 'Hotel Fasano', checkinDate: tomorrow, checkinTime: '09:00', checkoutDate: tomorrow, checkoutTime: '18:00', isVIP: true },
  { id: 'g3', name: 'Sra. Elena Vasquez', phone: '(51) 98888-5678', role: 'Expositora', hotel: 'Hotel Ibis', checkinDate: today, checkinTime: '17:00', checkoutDate: tomorrow, checkoutTime: '11:00' },
];

interface AppState {
  team: TeamMember[];
  vehicles: Vehicle[];
  transports: Transport[];
  tasks: Task[];
  events: AgendaEvent[];
  guests: Guest[];
  updateVehicle: (id: string, data: Partial<Vehicle>) => void;
  addVehicle: (vehicle: Vehicle) => void;
  addVehicleLog: (vehicleId: string, log: VehicleLog) => void;
  closeVehicleLog: (vehicleId: string, logId: string, returnDate: string, returnKm: number, returnTime?: string, note?: string) => void;
  updateTransport: (id: string, data: Partial<Transport>) => void;
  addTransport: (transport: Transport) => void;
  updateTask: (id: string, data: Partial<Task>) => void;
  addTask: (task: Task) => void;
  addEvent: (event: AgendaEvent) => void;
  updateEvent: (id: string, data: Partial<AgendaEvent>) => void;
  updateTeamMember: (id: string, data: Partial<TeamMember>) => void;
  addTeamMember: (member: TeamMember) => void;
  removeTeamMember: (id: string) => void;
  addSchedule: (memberId: string, schedule: WorkSchedule) => void;
  addGuest: (guest: Guest) => void;
  updateGuest: (id: string, data: Partial<Guest>) => void;
  removeGuest: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  team: initialTeam,
  vehicles: initialVehicles,
  transports: initialTransports,
  tasks: initialTasks,
  events: initialEvents,
  guests: initialGuests,
  updateVehicle: (id, data) =>
    set((s) => ({ vehicles: s.vehicles.map((v) => (v.id === id ? { ...v, ...data } : v)) })),
  addVehicle: (vehicle) =>
    set((s) => ({ vehicles: [...s.vehicles, vehicle] })),
  addVehicleLog: (vehicleId, log) =>
    set((s) => ({
      vehicles: s.vehicles.map((v) =>
        v.id === vehicleId ? { ...v, logs: [...v.logs, log], status: 'in_use' as VehicleStatus, assignedTo: log.userId } : v
      ),
    })),
  closeVehicleLog: (vehicleId, logId, returnDate, returnKm, returnTime, note) =>
    set((s) => ({
      vehicles: s.vehicles.map((v) =>
        v.id === vehicleId
          ? {
              ...v,
              logs: v.logs.map((l) => (l.id === logId ? { ...l, returnDate, returnKm, returnTime, note: note || l.note } : l)),
              status: 'available' as VehicleStatus,
              assignedTo: undefined,
              currentKm: returnKm,
            }
          : v
      ),
    })),
  updateTransport: (id, data) =>
    set((s) => ({ transports: s.transports.map((t) => (t.id === id ? { ...t, ...data } : t)) })),
  addTransport: (transport) =>
    set((s) => ({ transports: [...s.transports, transport] })),
  updateTask: (id, data) =>
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...data } : t)) })),
  addTask: (task) =>
    set((s) => ({ tasks: [...s.tasks, task] })),
  addEvent: (event) =>
    set((s) => ({ events: [...s.events, event] })),
  updateEvent: (id, data) =>
    set((s) => ({ events: s.events.map((e) => (e.id === id ? { ...e, ...data } : e)) })),
  updateTeamMember: (id, data) =>
    set((s) => ({ team: s.team.map((m) => (m.id === id ? { ...m, ...data } : m)) })),
  addTeamMember: (member) =>
    set((s) => ({ team: [...s.team, member] })),
  removeTeamMember: (id) =>
    set((s) => ({ team: s.team.filter((m) => m.id !== id) })),
  addSchedule: (memberId, schedule) =>
    set((s) => ({
      team: s.team.map((m) =>
        m.id === memberId
          ? { ...m, schedule: [...(m.schedule || []), schedule] }
          : m
      ),
    })),
  addGuest: (guest) =>
    set((s) => ({ guests: [...s.guests, guest] })),
  updateGuest: (id, data) =>
    set((s) => ({ guests: s.guests.map((g) => (g.id === id ? { ...g, ...data } : g)) })),
  removeGuest: (id) =>
    set((s) => ({ guests: s.guests.filter((g) => g.id !== id) })),
}));
