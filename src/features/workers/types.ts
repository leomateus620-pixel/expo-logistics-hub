export type WorkerId = 'agenda' | 'arena' | 'mapa' | 'interesse' | 'comissao' | 'logistica' | 'caixa' | 'radar';
export type MascotShape = 'mochi' | 'cubo' | 'onigiri' | 'favo' | 'hexagono' | 'nuvem' | 'triangulo' | 'paralelogramo';
export type MascotMood = 'idle' | 'happy' | 'thinking' | 'needsYou' | 'talking' | 'sad' | 'sleeping';
export interface WorkerContext { route: string; recordId?: string }
export interface WorkerSource { title: string; url: string; date?: string; kind?: 'app' | 'web' }
export interface WorkerChatMessage { id: string; role: 'user' | 'assistant' | 'system'; content: string; workerId?: WorkerId; createdAt: string; sources?: WorkerSource[]; chips?: { label: string; href: string }[] }
export interface WorkerConversation { id: string; title: string; workerId?: WorkerId; updatedAt: string }
export interface WorkerProgressStep { label: string; status: 'running' | 'complete' }
export interface WorkerAttachment { name: string; text: string; trust: 'untrusted' }
export interface WorkerDefinition {
  id: WorkerId; name: string; shape: MascotShape; color: string; ink: string; tagline: string; description: string;
  skills: { title: string; description: string }[]; data: string[]; access: string; capabilities: string[];
  futureActions: string[]; examples: string[]; routines: { title: string; schedule: string; prompt: string }[];
}
