import { Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/app-shell";
import { DashboardPage } from "@/pages/dashboard-page";
import { ProjectPage } from "@/pages/project-page";
import { JournalPage } from "@/pages/journal-page";
import { SuppliersPage } from "@/pages/suppliers-page";
import { SupplierDetailPage } from "@/pages/supplier-detail-page";
import { ConnectorSearchPage } from "@/pages/connector-search-page";
import { SchedulePage } from "@/pages/schedule-page";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projects/:id" element={<ProjectPage />} />
        <Route path="/journal" element={<JournalPage />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/suppliers/:id" element={<SupplierDetailPage />} />
        <Route path="/connectors" element={<ConnectorSearchPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
      </Route>
    </Routes>
  );
}
