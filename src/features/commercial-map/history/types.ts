export interface HistoricalDate {
  value: string;
  precision: 'year' | 'month' | 'day';
}

export interface HistorySource {
  id: string;
  title: string;
  url: string;
  publisher: string;
  reviewedAt: string;
}

export interface HistoryMilestone {
  date?: HistoricalDate;
  eventType: 'construcao' | 'inauguracao' | 'reforma' | 'uso' | 'homenagem';
  text: string;
  sourceIds: string[];
}

/** Public editorial data only; research drafts and unresolved claims live in docs. */
export interface HistoryEntry {
  id: string;
  /** Canonical reference IDs for auditing; persisted UUIDs resolve by exact publicIdentifier. */
  entityIds: string[];
  publicIdentifiers: string[];
  parentHistoryId?: string;
  title: string;
  aliases: string[];
  category: 'memoria' | 'cultura' | 'agricultura' | 'eventos' | 'apoio';
  summary: string;
  body?: string[];
  milestones: HistoryMilestone[];
  sourceIds: string[];
  imageIds: string[];
  editorialStatus: 'draft' | 'verified';
  publicationStatus: 'draft' | 'published';
  bindingStatus: 'pending' | 'verified';
  reviewedAt: string;
}
