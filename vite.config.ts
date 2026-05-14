import { defineConfig } from 'vite';

// Default base is '/jlpt/' (GitHub Pages at github.io/jlpt/).
// Override with BASE_PATH env var when deploying to a different mount point.
// Example for cobyserver root deploy: BASE_PATH=/ npm run build
const base = process.env.BASE_PATH ?? '/jlpt/';

export default defineConfig({
  base,
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
