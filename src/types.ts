export type ExamDomain = string;

export interface NetworkTopologyNode {
  id: string;
  label: string;
  type: 'router' | 'switch' | 'host' | 'cloud' | 'firewall';
  x: number;
  y: number;
}

export interface NetworkTopologyLink {
  from: string;
  to: string;
  label?: string;
  type?: 'ethernet' | 'serial' | 'trunk';
}

export interface NetworkTopology {
  nodes: NetworkTopologyNode[];
  links: NetworkTopologyLink[];
}

export interface Card {
  id: string;
  deckId: string;
  cardType: 'basic' | 'cloze';
  front: string;
  back: string;
  tag: ExamDomain;
  imagePath?: string;
  codeSnippet?: {
    code: string;
    language: string;
  };
  topology?: NetworkTopology;
  // SM-2 Spaced Repetition Fields (matching database schema)
  reps: number;
  interval: number;
  easeFactor: number;
  dueDate: string;
  lastReviewedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Deck {
  id: string;
  name: string;
  description: string;
  studyMaterial?: string;
  createdAt: string;
}

export interface ReviewHistory {
  id: string;
  cardId: string;
  rating: number;
  timestamp: string;
  previousInterval: number;
  nextInterval: number;
  previousEaseFactor: number;
  nextEaseFactor: number;
}

export interface UserStats {
  totalReviews: number;
  streakDays: number;
  lastReviewDate?: string;
}