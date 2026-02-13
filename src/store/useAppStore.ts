import { create } from 'zustand';

export type TaskStatus = 'pending' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type VehicleType = 'car' | 'electric';
export type VehicleStatus = 'available' | 'in_use' | 'maintenance';
export type TransportStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar?: string;
  color: string;
}

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  type: VehicleType;
  status: VehicleStatus;
  assignedTo?: string;
  currentLocation?: string;
}

export interface Transport {
  id: string;
  guestName: string;
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
}

const TEAM_COLORS = [
  'hsl(195, 80%, 30%)', 'hsl(38, 92%, 50%)', 'hsl(152, 60%, 40%)',
  'hsl(280, 60%, 50%)', 'hsl(340, 70%, 50%)', 'hsl(210, 80%, 55%)',
  'hsl(160, 70%, 35%)', 'hsl(20, 80%, 50%)', 'hsl(260, 50%, 55%)',
  'hsl(0, 70%, 55%)',
];

const today = new Date().toISOString().split('T')[0];
const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

const initialTeam: TeamMember[] = [
  { id: '1', name: 'Ana Silva', role: 'Coordenadora Geral', color: TEAM_COLORS[0] },
  { id: '2', name: 'Carlos Santos', role: 'Motorista', color: TEAM_COLORS[1] },
  { id: '3', name: 'Maria Oliveira', role: 'Recepção VIP', color: TEAM_COLORS[2] },
  { id: '4', name: 'Pedro Costa', role: 'Motorista', color: TEAM_COLORS[3] },
  { id: '5', name: 'Julia Ferreira', role: 'Logística', color: TEAM_COLORS[4] },
  { id: '6', name: 'Lucas Almeida', role: 'Motorista', color: TEAM_COLORS[5] },
  { id: '7', name: 'Beatriz Lima', role: 'Recepção', color: TEAM_COLORS[6] },
  { id: '8', name: 'Rafael Souza', role: 'Logística', color: TEAM_COLORS[7] },
  { id: '9', name: 'Camila Rocha', role: 'Assistente', color: TEAM_COLORS[8] },
  { id: '10', name: 'Fernando Dias', role: 'Motorista', color: TEAM_COLORS[9] },
];

const initialVehicles: Vehicle[] = [
  { id: 'v1', name: 'Sedan Executivo', plate: 'ABC-1234', type: 'car', status: 'available' },
  { id: 'v2', name: 'SUV Premium', plate: 'DEF-5678', type: 'car', status: 'in_use', assignedTo: '2', currentLocation: 'Aeroporto' },
  { id: 'v3', name: 'Tesla Model 3', plate: 'ELE-0001', type: 'electric', status: 'available' },
  { id: 'v4', name: 'BYD Dolphin', plate: 'ELE-0002', type: 'electric', status: 'in_use', assignedTo: '4', currentLocation: 'Hotel Central' },
  { id: 'v5', name: 'Van Executiva', plate: 'GHI-9012', type: 'car', status: 'available' },
  { id: 'v6', name: 'Nissan Leaf', plate: 'ELE-0003', type: 'electric', status: 'maintenance' },
];

const initialTransports: Transport[] = [
  { id: 't1', guestName: 'Dr. Roberto Mendes', from: 'Aeroporto GRU', to: 'Hotel Fasano', dateTime: `${today}T14:00`, vehicleId: 'v2', driverId: '2', status: 'in_progress', isVIP: true },
  { id: 't2', guestName: 'Delegação Japão (5 pax)', from: 'Hotel Hilton', to: 'Centro de Convenções', dateTime: `${today}T09:00`, vehicleId: 'v5', driverId: '6', status: 'completed' },
  { id: 't3', guestName: 'Sra. Elena Vasquez', from: 'Rodoviária', to: 'Hotel Ibis', dateTime: `${today}T16:30`, status: 'scheduled', isVIP: false },
  { id: 't4', guestName: 'Min. Paulo Guedes', from: 'Aeroporto Congonhas', to: 'Hotel Fasano', dateTime: `${tomorrow}T08:00`, vehicleId: 'v3', driverId: '4', status: 'scheduled', isVIP: true },
];

const initialTasks: Task[] = [
  { id: 'tk1', title: 'Verificar carregamento dos veículos elétricos', date: tomorrow, status: 'pending', priority: 'high', assignedTo: '5', category: 'logistics' },
  { id: 'tk2', title: 'Preparar kits de boas-vindas VIP', date: tomorrow, status: 'pending', priority: 'urgent', assignedTo: '3', category: 'reception' },
  { id: 'tk3', title: 'Confirmar reservas de hotel', date: today, status: 'done', priority: 'high', assignedTo: '9', category: 'general', completedAt: `${today}T10:30`, completedBy: '9' },
  { id: 'tk4', title: 'Revisar rota aeroporto-hotel', date: tomorrow, status: 'pending', priority: 'medium', assignedTo: '2', category: 'transport' },
  { id: 'tk5', title: 'Testar Wi-Fi no centro de convenções', date: today, status: 'in_progress', priority: 'medium', assignedTo: '8', category: 'logistics' },
  { id: 'tk6', title: 'Organizar credenciais de acesso', date: tomorrow, status: 'pending', priority: 'high', assignedTo: '7', category: 'reception' },
];

const initialEvents: AgendaEvent[] = [
  { id: 'e1', title: 'Abertura Oficial da Feira', date: today, startTime: '09:00', endTime: '10:00', location: 'Auditório Principal', category: 'cerimônia', isVIP: true },
  { id: 'e2', title: 'Painel: Sustentabilidade nos Negócios', date: today, startTime: '10:30', endTime: '12:00', location: 'Sala 1', category: 'painel' },
  { id: 'e3', title: 'Almoço VIP', date: today, startTime: '12:30', endTime: '14:00', location: 'Restaurante Rooftop', category: 'refeição', isVIP: true },
  { id: 'e4', title: 'Workshop: Mobilidade Elétrica', date: today, startTime: '14:30', endTime: '16:00', location: 'Sala 3', category: 'workshop' },
  { id: 'e5', title: 'Recepção de Boas-Vindas', date: tomorrow, startTime: '08:00', endTime: '09:00', location: 'Lobby Hotel Fasano', category: 'recepção', isVIP: true },
  { id: 'e6', title: 'Mesa Redonda: Exportação', date: tomorrow, startTime: '09:30', endTime: '11:30', location: 'Sala 2', category: 'painel' },
];

interface AppState {
  team: TeamMember[];
  vehicles: Vehicle[];
  transports: Transport[];
  tasks: Task[];
  events: AgendaEvent[];
  updateVehicle: (id: string, data: Partial<Vehicle>) => void;
  updateTransport: (id: string, data: Partial<Transport>) => void;
  addTransport: (transport: Transport) => void;
  updateTask: (id: string, data: Partial<Task>) => void;
  addTask: (task: Task) => void;
  addEvent: (event: AgendaEvent) => void;
  updateEvent: (id: string, data: Partial<AgendaEvent>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  team: initialTeam,
  vehicles: initialVehicles,
  transports: initialTransports,
  tasks: initialTasks,
  events: initialEvents,
  updateVehicle: (id, data) =>
    set((s) => ({ vehicles: s.vehicles.map((v) => (v.id === id ? { ...v, ...data } : v)) })),
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
}));
