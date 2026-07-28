import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Home, Users } from 'lucide-react';

/** Sélecteur du foyer actif : change quel stock partagé l'utilisateur voit/édite. */
export default function HouseholdSwitcher() {
  const { t } = useTranslation('household');
  const { households, activeHousehold, switchHousehold } = useAuth();

  if (households.length <= 1) return null;

  return (
    <div className="px-4 pb-3">
      <Select value={activeHousehold?.id || ''} onValueChange={switchHousehold}>
        <SelectTrigger className="w-full" data-testid="household-switcher">
          <SelectValue placeholder={t('switcher.placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {households.map((household) => (
            <SelectItem key={household.id} value={household.id}>
              <span className="flex items-center gap-2">
                {household.is_personal ? <Home className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                {household.is_personal ? t('switcher.personal') : household.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
