import { defineConfig } from 'vite';

// Base = nom du dépôt, uniquement pour le build de prod : le site GitHub Pages
// est servi sous https://<utilisateur>.github.io/vehemence-squadron/.
// En dev, on garde la racine pour ne pas casser le serveur local.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/vehemence-squadron/' : '/',
}));
