import type {
  ChangeLogEntry,
  Component,
  ComponentCategory,
  CrossReference,
  ExportHistoryEntry,
  ExportPreview,
  ImportBatch,
  ImportPreviewResult,
  ImportProfile,
  InspectResult,
  PriceHistoryEntry,
  Project,
  ProjectComponent,
  ProjectCompetitor,
  ProjectImage,
  ProjectInput,
  ProjectSummary,
  Supplier,
  SupplierDetail,
} from "./types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Ошибка запроса: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listProjects: () => request<Project[]>("/projects"),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (data: ProjectInput) =>
    request<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id: string, data: Partial<ProjectInput>) =>
    request<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  projectChangelog: (id: string) => request<ChangeLogEntry[]>(`/projects/${id}/changelog`),
  changelog: (limit = 100) => request<ChangeLogEntry[]>(`/changelog?limit=${limit}`),

  // --- Этап 2 --------------------------------------------------------

  projectSummary: (projectId: string) => request<ProjectSummary>(`/projects/${projectId}/summary`),

  listComponents: (search?: string) => request<Component[]>(`/components${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  getComponent: (id: string) => request<Component & { crossReferences: CrossReference[]; projectComponents: any[] }>(`/components/${id}`),
  createComponent: (data: Partial<Component>) => request<Component>("/components", { method: "POST", body: JSON.stringify(data) }),
  listCategories: () => request<ComponentCategory[]>("/categories"),
  createCategory: (name: string) => request<ComponentCategory>("/categories", { method: "POST", body: JSON.stringify({ name }) }),

  listProjectComponents: (projectId: string) => request<ProjectComponent[]>(`/projects/${projectId}/components`),
  addProjectComponent: (projectId: string, data: Record<string, unknown>) =>
    request<ProjectComponent>(`/projects/${projectId}/components`, { method: "POST", body: JSON.stringify(data) }),
  updateProjectComponent: (projectId: string, id: string, data: Record<string, unknown>) =>
    request<ProjectComponent>(`/projects/${projectId}/components/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteProjectComponent: (projectId: string, id: string) =>
    request<void>(`/projects/${projectId}/components/${id}`, { method: "DELETE" }),

  listSuppliers: () => request<Supplier[]>("/suppliers"),
  getSupplier: (id: string) => request<SupplierDetail>(`/suppliers/${id}`),
  createSupplier: (data: Partial<Supplier>) => request<Supplier>("/suppliers", { method: "POST", body: JSON.stringify(data) }),
  updateSupplier: (id: string, data: Partial<Supplier>) => request<Supplier>(`/suppliers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  listCrossReferences: () => request<CrossReference[]>("/cross-references"),
  createCrossReference: (data: Record<string, unknown>) =>
    request<CrossReference>("/cross-references", { method: "POST", body: JSON.stringify(data) }),
  updateCrossReference: (id: string, data: Record<string, unknown>) =>
    request<CrossReference>(`/cross-references/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCrossReference: (id: string) => request<void>(`/cross-references/${id}`, { method: "DELETE" }),
  addPrice: (crossReferenceId: string, data: Record<string, unknown>) =>
    request<{ price: unknown; changed: boolean }>(`/cross-references/${crossReferenceId}/price`, { method: "POST", body: JSON.stringify(data) }),
  priceHistory: (crossReferenceId: string) => request<PriceHistoryEntry[]>(`/cross-references/${crossReferenceId}/price-history`),

  inspectImportFile: (file: File, sheetName?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (sheetName) form.append("sheetName", sheetName);
    return request<InspectResult>("/imports/inspect", { method: "POST", body: form });
  },
  listImportProfiles: (supplierId: string) => request<ImportProfile[]>(`/imports/profiles?supplierId=${supplierId}`),
  createImportProfile: (data: Record<string, unknown>) =>
    request<ImportProfile>("/imports/profiles", { method: "POST", body: JSON.stringify(data) }),
  previewImport: (params: { file: File; supplierId: string; profileId?: string; parseConfig?: unknown }) => {
    const form = new FormData();
    form.append("file", params.file);
    form.append("supplierId", params.supplierId);
    if (params.profileId) form.append("profileId", params.profileId);
    if (params.parseConfig) form.append("parseConfig", JSON.stringify(params.parseConfig));
    return request<ImportPreviewResult>("/imports/preview", { method: "POST", body: form });
  },
  confirmImport: (batchId: string) => request<ImportBatch>(`/imports/${batchId}/confirm`, { method: "POST", body: "{}" }),
  listImportBatches: (supplierId?: string) => request<ImportBatch[]>(`/imports/batches${supplierId ? `?supplierId=${supplierId}` : ""}`),
  getImportBatch: (id: string) => request<ImportBatch>(`/imports/batches/${id}`),

  previewExport: (data: { supplierId: string; projectIds: string[] }) =>
    request<ExportPreview>("/exports/preview", { method: "POST", body: JSON.stringify(data) }),
  exportHistory: (supplierId?: string) => request<ExportHistoryEntry[]>(`/exports/history${supplierId ? `?supplierId=${supplierId}` : ""}`),

  listProjectImages: (projectId: string) => request<ProjectImage[]>(`/projects/${projectId}/images`),
  uploadProjectImage: (projectId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<ProjectImage>(`/projects/${projectId}/images`, { method: "POST", body: form });
  },
  deleteProjectImage: (projectId: string, imageId: string) =>
    request<void>(`/projects/${projectId}/images/${imageId}`, { method: "DELETE" }),

  listProjectCompetitors: (projectId: string) => request<ProjectCompetitor[]>(`/projects/${projectId}/competitors`),
  createProjectCompetitor: (projectId: string, data: Record<string, unknown>) =>
    request<ProjectCompetitor>(`/projects/${projectId}/competitors`, { method: "POST", body: JSON.stringify(data) }),
  updateProjectCompetitor: (projectId: string, id: string, data: Record<string, unknown>) =>
    request<ProjectCompetitor>(`/projects/${projectId}/competitors/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteProjectCompetitor: (projectId: string, id: string) =>
    request<void>(`/projects/${projectId}/competitors/${id}`, { method: "DELETE" }),
};

export async function downloadExport(data: { supplierId: string; projectIds: string[]; currency?: string }) {
  const res = await fetch(`${BASE}/exports/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Ошибка выгрузки: ${res.status}`);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="(.+)"/);
  const filename = match ? match[1] : "export.xlsx";
  const blob = await res.blob();
  return { blob, filename };
}
