import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';
import path from 'node:path';

/**
 * Map Lab (Phase 4A): minimal Storybook scoped to the cartographic visual
 * language. Primitives stories will come in Phase 4B once tokens/map are
 * stable.
 */
const config: StorybookConfig = {
  stories: [
    '../src/design-system/map/**/*.stories.@(ts|tsx|mdx)',
  ],
  addons: ['@storybook/addon-essentials'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  core: { disableTelemetry: true },
  async viteFinal(viteConfig) {
    return mergeConfig(viteConfig, {
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '../src'),
        },
      },
    });
  },
};

export default config;
