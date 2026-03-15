import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppLayout } from '@/components/layout/AppLayout'
import { HomePage } from '@/pages/HomePage'
import {
  BuildRacePage,
  BuildClassPage,
  BuildBackgroundPage,
  BuildProficienciesPage,
  BuildAbilityScoresPage,
} from '@/pages/BuildPages'
import {
  FeatsPage,
  SpellsPage,
  EquipmentPage,
  DetailsPage,
  CharacterSheetPage,
  SettingsPage,
} from '@/pages/OtherPages'
import {
  PortraitPage,
  CharacteristicsPage,
  AppearancePage,
  AlliesOrganizationsPage,
  HistoryPage,
} from '@/pages/details'
import { CompendiumPage } from '@/pages/CompendiumPage'
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
      </BrowserRouter>
    </TooltipProvider>
  )
}

export default App