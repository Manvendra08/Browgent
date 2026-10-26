import { defineConfig, build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fs from 'fs';

function buildContentScript() {
  return {
    name: 'build-content-script',
    async writeBundle() {
      await build({
        configFile: false,
        build: {
          emptyOutDir: false,
          outDir: resolve(__dirname, 'dist'),
          rollupOptions: {
            input: resolve(__dirname, 'src/content/index.ts'),
            output: {
              format: 'iife',
              entryFileNames: 'content.js',
              extend: true,
            },
          },
        },
      });
      console.log('[build] Bundled self-contained IIFE content.js');
    },
  };
}

function copyExtensionAssets() {
  return {
    name: 'copy-extension-assets',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
      }

      // Copy manifest.json
      const manifestSrc = resolve(__dirname, 'src/manifest.json');
      const manifestDest = resolve(distDir, 'manifest.json');
      if (fs.existsSync(manifestSrc)) {
        fs.copyFileSync(manifestSrc, manifestDest);
        console.log('[build] Copied manifest.json to dist/');
      }

      // Copy icons directory
      const iconsSrc = resolve(__dirname, 'public/icons');
      const iconsDest = resolve(distDir, 'icons');
      if (fs.existsSync(iconsSrc)) {
        if (!fs.existsSync(iconsDest)) {
          fs.mkdirSync(iconsDest, { recursive: true });
        }
        for (const file of fs.readdirSync(iconsSrc)) {
          fs.copyFileSync(resolve(iconsSrc, file), resolve(iconsDest, file));
        }
        console.log('[build] Copied icons to dist/icons/');
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), buildContentScript(), copyExtensionAssets()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') {
            return '[name].js';
          }
          return 'assets/[name].js';
        },
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      // Type-only modules and the manifest carry no executable code.
      exclude: ['src/**/*.d.ts', 'src/**/types.ts', 'src/manifest.json'],
      thresholds: {
        statements: 69,
        branches: 67,
        functions: 63,
        lines: 69,
      },
    },
  },
});
