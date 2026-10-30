import type { OverallStatus, ProcessField } from "./statuses";

export type Project = {
  id: string;
  name: string;
  article: string | null;
  responsible: string | null;
  overallStatus: OverallStatus;
  plannedDate: string | null;
  createdAt: string;
  updatedAt: string;
  progress: number;
  nextAction: string;
} & Record<ProcessField, string>;

export type ProjectInput = Partial<
  Omit<Project, "id" | "createdAt" | "updatedAt" | "progress" | "nextAction">
> & { name: string };

export type ChangeLogEntry = {
  id: string;
  projectId: string;
  field: string;
  fieldLabel: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  changedAt: string;
  project?: { id: string; name: string };
};
