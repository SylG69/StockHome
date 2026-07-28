import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { AVAILABLE_LANGUAGES } from '../i18n/languages';

export default function LanguageSelector() {
  const { i18n } = useTranslation();

  return (
    <Select value={i18n.language} onValueChange={(code) => i18n.changeLanguage(code)}>
      <SelectTrigger data-testid="language-selector" className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {AVAILABLE_LANGUAGES.map((lang) => (
          <SelectItem key={lang.code} value={lang.code}>
            {lang.flag} {lang.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
