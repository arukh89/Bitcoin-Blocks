export interface User {
  address: string;
  username: string;
  displayName?: string;
  pfpUrl: string;
  isAdmin?: boolean;
  createdAt?: number;
  lastActive?: number;
}

export interface Round {
  id: string;
  roundNumber: number;
  startTime: number;
  endTime: number;
  prize: string;
  status: 'open' | 'closed' | 'finished';
  blockNumber?: number;
  actualTxCount?: number;
  winningAddress?: string;
  blockHash?: string;
  createdAt: number;
  firstPlacePrize?: string;
  secondPlacePrize?: string;
  currency?: string;
  duration?: number;
}

export interface Guess {
  id: string;
  roundId: string;
  address: string;
  username: string;
  guess: number;
  pfpUrl: string;
  submittedAt: number;
}

export interface ChatMessage {
  id: string;
  roundId: string;
  address: string;
  username: string;
  message: string;
  pfpUrl: string;
  timestamp: number;
  type: 'guess' | 'system' | 'winner' | 'chat';
}

export interface Log {
  id: string;
  eventType: string;
  details: string;
  timestamp: number;
}

export interface LeaderboardEntry {
  address: string;
  username: string;
  pfpUrl: string;
  guess: number;
  difference?: number;
  submittedAt: number;
  isWinner?: boolean;
}

export interface PrizeConfiguration {
  id: number;
  jackpotAmount: string;
  firstPlaceAmount: string;
  secondPlaceAmount: string;
  currencyType: string;
  tokenContractAddress: string;
  updatedAt: number;
}
