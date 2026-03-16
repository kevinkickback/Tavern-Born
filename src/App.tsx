import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppLayout } from '@/components/layout/AppLayout'
import { HomePage } from '@/pages/HomePage'
import { BuildRacePage } from '@/pages/build/BuildRacePage'
import { BuildClassPage } from '@/pages/build/BuildClassPage'
import { BuildBackgroundPage } from '@/pages/build/BuildBackgroundPage'
import { BuildProficienciesPage } from '@/pages/build/BuildProficienciesPage'
import { BuildAbilityScoresPage } from '@/pages/build/BuildAbilityScoresPage'
import { FeatsPage } from '@/pages/FeatsPage'
import { SpellsPage } from '@/pages/SpellsPage'
import { EquipmentPage } from '@/pages/EquipmentPage'
import { CharacterSheetPage } from '@/pages/CharacterSheetPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { PortraitPage } from '@/pages/details/PortraitPage'
import { CharacteristicsPage } from '@/pages/details/CharacteristicsPage'
import { AppearancePage } from '@/pages/details/AppearancePage'
import { AlliesOrganizationsPage } from '@/pages/details/AlliesOrganizationsPage'
import { HistoryPage } from '@/pages/details/HistoryPage'
import { CompendiumPage } from '@/pages/CompendiumPage'
import { DataSourceStartupModal } from '@/components/settings/DataSourceStartupModal'
import { useSeedData } from '@/hooks/useSeedData'

function App() {
  useSeedData()

  return (
    <TooltipProvider delayDuration={300}>
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/build" element={<Navigate to="/build/race" replace />} />
            <Route path="/build/race" element={<BuildRacePage />} />
            <Route path="/build/class" element={<BuildClassPage />} />
            <Route path="/build/background" element={<BuildBackgroundPage />} />
            <Route path="/build/proficiencies" element={<BuildProficienciesPage />} />
            <Route path="/build/ability-scores" element={<BuildAbilityScoresPage />} />
            <Route path="/feats" element={<FeatsPage />} />
            <Route path="/spells" element={<SpellsPage />} />
            <Route path="/equipment" element={<EquipmentPage />} />
            <Route path="/details" element={<Navigate to="/details/portrait" replace />} />
            <Route path="/details/portrait" element={<PortraitPage />} />
            <Route path="/details/characteristics" element={<CharacteristicsPage />} />
            <Route path="/details/appearance" element={<AppearancePage />} />
            <Route path="/details/allies-organizations" element={<AlliesOrganizationsPage />} />
            <Route path="/details/history" element={<HistoryPage />} />
            <Route path="/character-sheet" element={<CharacterSheetPage />} />
            <Route path="/compendium" element={<CompendiumPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </AppLayout>
        <Toaster position="bottom-right" />
        <DataSourceStartupModal />
      </BrowserRouter>
    </TooltipProvider>
  )
}

export default App