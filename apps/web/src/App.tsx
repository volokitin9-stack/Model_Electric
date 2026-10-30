import { Route, Routes } from "react-router-dom";
import { DashboardPage } from "@/pages/dashboard-page";
import { ProjectPage } from "@/pages/project-page";
import { JournalPage } from "@/pages/journal-page";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/projects/:id" element={<ProjectPage />} />
      <Route path="/journal" element={<JournalPage />} />
    </Routes>
  );
}
