import type { CSSProperties } from 'react';
import { safeWorkerSourceUrl } from './api';
import type { WorkerDefinition, WorkerSource } from './types';

export function workerStyle(worker: WorkerDefinition): CSSProperties { return { '--worker-color': worker.color, '--worker-color-ink': worker.ink } as CSSProperties; }
export function safeSourceUrl(value: string, kind?: WorkerSource['kind']): string | null { return safeWorkerSourceUrl(value, kind ?? (value.startsWith('/') ? 'app' : 'web')); }
