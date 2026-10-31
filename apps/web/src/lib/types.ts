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

// --- Этап 2: комплектующие и поставщики ---------------------------------

export type ComponentCategory = { id: string; name: string };

export type Component = {
  id: string;
  internalArticle: string;
  name: string;
  categoryId: string | null;
  category?: ComponentCategory | null;
  unit: string;
  imagePath: string | null;
  description: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { crossReferences: number; projectComponents: number };
};

export type CostResult = { amount: string | null; currency: string | null; source: "supplier" | "planned" | "unknown" };

export type ProjectComponent = {
  id: string;
  projectId: string;
  componentId: string;
  component: Component;
  quantity: string;
  status: string;
  primaryOfferId: string | null;
  primaryOffer?: CrossReference | null;
  plannedPrice: string | null;
  plannedCurrency: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  cost: CostResult;
  lineTotal: string | null;
};

export type Supplier = {
  id: string;
  code: string;
  name: string;
  country: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  messenger: string | null;
  website: string | null;
  defaultCurrency: string;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  crossReferenceCount?: number;
  pricedArticleCount?: number;
  lastImportAt?: string | null;
  lastPriceChangeAt?: string | null;
};

export type SupplierDetail = Supplier & {
  crossReferences: CrossReference[];
  importProfiles: ImportProfile[];
  importBatches: ImportBatch[];
  exportHistory: ExportHistoryEntry[];
  projects: { id: string; name: string }[];
};

export type CurrentPrice = {
  price: string;
  currency: string;
  availability: string | null;
  minimumOrderQuantity: number | null;
  leadTimeDays: number | null;
  effectiveAt: string;
};

export type CrossReference = {
  id: string;
  supplierId?: string;
  supplier?: { id: string; code: string; name: string };
  // Список /api/cross-references отдаёт только вложенный component.id,
  // без отдельного componentId — используйте component?.id.
  component?: { id: string; internalArticle: string; name: string };
  supplierArticle: string;
  status: string;
  isPrimary: boolean;
  source: string;
  currentPrice?: CurrentPrice | null;
  prices?: CurrentPrice[];
  projects?: { id: string; name: string }[];
  createdAt: string;
  updatedAt: string;
};

export type PriceHistoryEntry = {
  id: string;
  crossReferenceId: string;
  oldPrice: string | null;
  newPrice: string;
  currency: string;
  changedAt: string;
  sourceFileId: string | null;
};

export type ColumnMapping = {
  ourArticle?: number;
  supplierArticle: number;
  price?: number;
  currency?: number;
  availability?: number;
  moq?: number;
  leadTimeDays?: number;
};

export type ImportProfile = {
  id: string;
  supplierId: string;
  profileName: string;
  fileType: "xlsx" | "xls" | "csv";
  sheetName: string | null;
  headerRow: number;
  dataStartRow: number;
  columnMapping: ColumnMapping;
  localSourceKey: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ImportBatch = {
  id: string;
  supplierId: string;
  profileId: string | null;
  sourceFile: string;
  sourceHash: string;
  importedAt: string;
  rowsRead: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsRejected: number;
  status: "pending" | "previewed" | "applied" | "failed";
  report?: ImportDiff | null;
};

export type ImportDiffRow = Record<string, any>;
export type ImportDiff = {
  diff: {
    newLinks: ImportDiffRow[];
    priceUpdates: ImportDiffRow[];
    noChange: ImportDiffRow[];
    unknownArticles: ImportDiffRow[];
    orphanPrices: ImportDiffRow[];
    duplicates: ImportDiffRow[];
    errors: ImportDiffRow[];
    counts: Record<string, number>;
  };
};

export type ImportPreviewResult =
  | { alreadyImported: true; message: string; batch: ImportBatch }
  | { alreadyImported: false; batchId: string; diff: ImportDiff["diff"] };

export type InspectResult = { sheetNames: string[]; headers: string[]; sampleRows: string[][] };

export type ExportHistoryEntry = {
  id: string;
  supplierId: string;
  selectedProjectIds: string[];
  exportedAt: string;
  rowsExported: number;
  excludedRows: number;
  exportStatus: string;
  supplier?: { name: string; code: string };
};

export type ExportPreview = {
  supplier: { id: string; code: string; name: string };
  projectCount: number;
  componentCount: number;
  crossReferenceCount: number;
  noPriceCount: number;
  noOfferCount: number;
  conflictCount: number;
  uniqueRowCount: number;
  currencyBreakdown: Record<string, number>;
  isMixedCurrency: boolean;
  rows: { supplierArticle: string; price: string; currency: string; ourArticle: string; componentName: string }[];
  noPriceComponents: { ourArticle: string; componentName: string }[];
  noOfferComponents: { ourArticle: string; componentName: string }[];
  conflicts: { componentId: string; ourArticle: string; reason: string }[];
};

export type ProjectImage = { id: string; projectId: string; imagePath: string; mimeType: string; sizeBytes: number; uploadedAt: string };

export type ProjectCompetitor = {
  id: string;
  projectId: string;
  sellerName: string;
  productName: string;
  productUrl: string | null;
  price: string | null;
  currency: string | null;
  comment: string | null;
  checkedAt: string;
  updatedAt: string;
};

export type ProjectSummary = {
  specFillPercent: number;
  costSummary: {
    totalsByCurrency: Record<string, string>;
    isPartial: boolean;
    isMixedCurrency: boolean;
    pricedCount: number;
    missingCount: number;
    applicableCount: number;
  };
  supplierCount: number;
  missingCount: number;
  componentCount: number;
};
