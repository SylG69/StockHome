# StockHome - Application de Gestion de Stock à Domicile

## Problème Original
Application web de gestion de stock à domicile avec:
- Organisation des produits avec emplacement, quantité, description
- Regroupement par catégories
- Génération automatique de liste de courses (quantité minimum)
- Lecture de codes-barres (caméra + USB)
- Intégration Open Food Facts
- API REST pour future application mobile

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn UI
- **Backend**: FastAPI (Python)
- **Base de données**: MongoDB
- **Auth**: JWT (bcrypt)
- **Scanner**: @zxing/library
- **API externe**: Open Food Facts

## Personas Utilisateurs
1. **Particulier** - Gère son stock domestique (cuisine, salle de bain)
2. **Famille** - Organisation collaborative du stock familial

## Fonctionnalités Implémentées ✅
- [x] Authentification JWT (inscription/connexion)
- [x] Dashboard avec statistiques
- [x] CRUD Produits complet
- [x] CRUD Catégories avec icônes/couleurs
- [x] CRUD Emplacements de stockage
- [x] Scanner code-barres (caméra + USB)
- [x] Intégration Open Food Facts
- [x] Liste de courses automatique
- [x] Alertes stock bas
- [x] API REST complète

## Endpoints API
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | /api/auth/register | Inscription |
| POST | /api/auth/login | Connexion |
| GET | /api/auth/me | Profil utilisateur |
| GET/POST/PUT/DELETE | /api/products | CRUD produits |
| PATCH | /api/products/{id}/quantity | Mise à jour quantité |
| GET | /api/barcode/{barcode} | Lookup Open Food Facts |
| GET/POST/PUT/DELETE | /api/categories | CRUD catégories |
| GET/POST/PUT/DELETE | /api/locations | CRUD emplacements |
| GET/POST/DELETE | /api/shopping-list | Liste de courses |
| GET | /api/shopping-list/generate | Génération auto |
| GET | /api/dashboard/stats | Statistiques |

## Backlog - Prochaines Étapes

### P0 - Priorité Haute
- [ ] Export PDF de la liste de courses
- [ ] Notifications push pour stock bas

### P1 - Priorité Moyenne
- [ ] Historique des achats
- [ ] Dates de péremption
- [ ] Multi-utilisateurs par foyer

### P2 - Priorité Basse
- [ ] Mode hors-ligne
- [ ] Import/Export données
- [ ] Statistiques de consommation

## Date de création
Janvier 2026
