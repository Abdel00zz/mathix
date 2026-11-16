// Harnais d'aperçu jetable — à supprimer après vérification visuelle.
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import ProfConsoleApp from './components/ProfStudio/ProfConsoleApp';

createRoot(document.getElementById('root')!).render(
  <ProfConsoleApp
    classId="1apic"
    profName="Prof. Démo"
    onLogout={() => {}}
    onUpdateProfile={() => {}}
  />,
);
