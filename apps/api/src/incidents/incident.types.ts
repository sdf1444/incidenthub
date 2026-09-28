export const severities = ['low', 'medium', 'high', 'critical'] as const;
export const statuses = ['open', 'investigating', 'monitoring', 'resolved'] as const;

export type Severity = (typeof severities)[number];
export type IncidentStatus = (typeof statuses)[number];

export interface TimelineEvent {
  id: string;
  message: string;
  createdAt: string;
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  status: IncidentStatus;
  owner: string;
  createdAt: string;
  updatedAt: string;
  timeline: TimelineEvent[];
}
