import type { CSSProperties } from 'react';
import { safeWorkerSourceUrl } from './api';
import type { WorkerDefinition } from './types';

export function workerStyle(worker: WorkerDefinition): CSSProperties { return { '--worker-color': worker.color, '--worker-color-ink': worker.ink } as CSSProperties; }
export function safeSourceUrl(value: string): string | null { return safeWorkerSourceUrl(value, value.startsWith('/') ? 'app' : 'web'); }
