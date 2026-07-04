// Préfixe un chemin absolu de public/ (ex. '/audio/x.wav') avec la base du
// site courant. En dev la base est '/', donc aucun effet ; sous GitHub Pages
// le jeu est servi depuis un sous-dossier (/vehemence-squadron/), et ces
// chemins codés en dur dans le JS ne sont pas réécrits automatiquement par
// Vite (contrairement aux références dans index.html) — d'où cet utilitaire.
export function assetUrl(path) {
  return import.meta.env.BASE_URL.replace(/\/$/, '') + path;
}
