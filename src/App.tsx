import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { AppLoadingOverlay } from '@/components/layout/AppLoadingOverlay';
import { DataSourceStartupModal } from '@/components/settings/DataSourceStartupModal';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useDataInit } from '@/hooks/data/useDataInit';
import { BuildAbilityScoresPage } from '@/pages/build/BuildAbilityScoresPage';
import { BuildBackgroundPage } from '@/pages/build/BuildBackgroundPage';
import { BuildClassPage } from '@/pages/build/BuildClassPage';
import { BuildProficienciesPage } from '@/pages/build/BuildProficienciesPage';
import { BuildRacePage } from '@/pages/build/BuildRacePage';
import { CharacterSheetPage } from '@/pages/CharacterSheetPage';
import { CompendiumPage } from '@/pages/CompendiumPage';
import { AlliesOrganizationsPage } from '@/pages/details/AlliesOrganizationsPage';
import { AppearancePage } from '@/pages/details/AppearancePage';
import { CharacteristicsPage } from '@/pages/details/CharacteristicsPage';
import { HistoryPage } from '@/pages/details/HistoryPage';
import { PortraitPage } from '@/pages/details/PortraitPage';
import { EquipmentPage } from '@/pages/EquipmentPage';
import { FeatsPage } from '@/pages/FeatsPage';
import { HomePage } from '@/pages/HomePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SpellsPage } from '@/pages/SpellsPage';

function App() {
  useDataInit();

  return (
    <TooltipProvider delayDuration={300}>
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route
              path="/build"
              element={<Navigate to="/build/race" replace />}
            />
            <Route path="/build/race" element={<BuildRacePage />} />
            <Route path="/build/class" element={<BuildClassPage />} />
            <Route path="/build/background" element={<BuildBackgroundPage />} />
            <Route
              path="/build/proficiencies"
              element={<BuildProficienciesPage />}
            />
            <Route
              path="/build/ability-scores"
              element={<BuildAbilityScoresPage />}
            />
            <Route path="/feats" element={<FeatsPage />} />
            <Route path="/spells" element={<SpellsPage />} />
            <Route path="/equipment" element={<EquipmentPage />} />
            <Route
              path="/details"
              element={<Navigate to="/details/portrait" replace />}
            />
            <Route path="/details/portrait" element={<PortraitPage />} />
            <Route
              path="/details/characteristics"
              element={<CharacteristicsPage />}
            />
            <Route path="/details/appearance" element={<AppearancePage />} />
            <Route
              path="/details/allies-organizations"
              element={<AlliesOrganizationsPage />}
            />
            <Route path="/details/history" element={<HistoryPage />} />
            <Route path="/character-sheet" element={<CharacterSheetPage />} />
            <Route path="/compendium" element={<CompendiumPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </AppLayout>
        <Toaster position="bottom-right" />
        <DataSourceStartupModal />
        <AppLoadingOverlay />
      </BrowserRouter>
    </TooltipProvider>
  );
}

export default App;
