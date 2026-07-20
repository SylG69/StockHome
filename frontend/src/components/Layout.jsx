import { useState } from 'react';
import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import {
  LayoutDashboard,
  Package,
  FolderOpen,
  MapPin,
  ShoppingCart,
  ScanLine,
  LogOut,
  Menu,
  X,
  Home,
  ShieldCheck,
  Tag,
  GitBranch,
  Info,
  Heart,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Tableau de bord', exact: true },
  { to: '/products', icon: Package, label: 'Produits' },
  { to: '/categories', icon: FolderOpen, label: 'Catégories' },
  { to: '/locations', icon: MapPin, label: 'Emplacements' },
  { to: '/shopping-list', icon: ShoppingCart, label: 'Liste de courses' },
  { to: '/scanner', icon: ScanLine, label: 'Scanner' },
];

// Entrée de menu affichée uniquement pour les administrateurs, en plus des
// items ci-dessus (voir usage avec .filter dans le rendu de la nav).
const adminNavItem = { to: '/users', icon: ShieldCheck, label: 'Utilisateurs' };

// Version affichée dans le menu, injectée au build via des variables Vite :
// - VITE_APP_VERSION : nom de la branche (staging/test) ou tag git (prod)
// - VITE_APP_ENV : "production" | "staging" | "development"
// Exemples de build :
//   Prod    : VITE_APP_VERSION=$(git describe --tags --always) VITE_APP_ENV=production npm run build
//   Staging : VITE_APP_VERSION=$(git rev-parse --abbrev-ref HEAD) VITE_APP_ENV=staging npm run build
// Si VITE_APP_VERSION n'est pas défini (ex: dev local), rien n'est affiché.
const APP_VERSION = import.meta.env.VITE_APP_VERSION || null;
const APP_ENV = import.meta.env.VITE_APP_ENV || 'production';
const IS_PROD_VERSION = APP_ENV === 'production';

// Petit badge discret : icône tag (release prod) ou branche (staging/test),
// suivi de la valeur brute (tag ou nom de branche). N'affiche rien si la
// version n'a pas été injectée au build.
// Liens secondaires du menu (À propos, Soutenir l'app), affichés juste
// au-dessus du badge de version. onNavigate ferme le menu mobile au clic.
function FooterLinks({ onNavigate }) {
  const items = [
    { to: '/about', icon: Info, label: 'À propos' },
    { to: '/sponsor', icon: Heart, label: "Soutenir l'app" },
  ];
  return (
    <div className="px-2 py-1 space-y-0.5">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors duration-200 ${
              isActive ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
            }`
          }
        >
          <item.icon className="w-3.5 h-3.5" />
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function VersionBadge() {
  if (!APP_VERSION) return null;
  const Icon = IS_PROD_VERSION ? Tag : GitBranch;
  return (
    <div className="px-4 py-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70">
      <Icon className="w-3 h-3 shrink-0" />
      <span className="font-mono truncate" title={APP_VERSION}>{APP_VERSION}</span>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // La page "Gestion des utilisateurs" n'est visible que pour les admins.
  const visibleNavItems = user?.role === 'admin' ? [...navItems, adminNavItem] : navItems;

  // Nom affiché dans le menu : "Prénom Nom" si renseignés, sinon le username.
  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-card border-r border-border">
        <div className="flex items-center gap-3 h-16 px-6 border-b border-border">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <Home className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">StockHome</h1>
            <p className="text-xs text-muted-foreground">Gestion de stock</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`
              }
              data-testid={`nav-${item.to.replace('/', '') || 'dashboard'}`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <FooterLinks />
        <VersionBadge />
        <div className="p-4 border-t border-border">
          <Link
            to="/profile"
            className="flex items-center gap-3 px-4 py-2 mb-3 rounded-lg hover:bg-secondary transition-colors duration-200"
            data-testid="profile-link"
          >
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-sm font-semibold text-primary">
                {displayName?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{displayName}</p>
            </div>
          </Link>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
            onClick={handleLogout}
            data-testid="logout-btn"
          >
            <LogOut className="w-5 h-5" />
            Déconnexion
          </Button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-card border-b border-border z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Home className="w-4 h-4 text-primary-foreground" />
          </div>
          <h1 className="text-lg font-bold">StockHome</h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          data-testid="mobile-menu-toggle"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </Button>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Menu */}
      <div
        className={`lg:hidden fixed top-16 left-0 right-0 bottom-0 bg-card z-40 transform transition-transform duration-300 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <nav className="px-4 py-6 space-y-1">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
          <FooterLinks onNavigate={() => setMobileMenuOpen(false)} />
          <VersionBadge />
          <Link
            to="/profile"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-3 px-4 py-2 mb-3 rounded-lg hover:bg-secondary transition-colors duration-200"
          >
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-sm font-semibold text-primary">
                {displayName?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{displayName}</p>
            </div>
          </Link>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
            onClick={handleLogout}
          >
            <LogOut className="w-5 h-5" />
            Déconnexion
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 pt-16 lg:pt-0">
        <div className="p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
