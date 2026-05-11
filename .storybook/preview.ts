import type { Preview } from '@storybook/react';
import '../src/index.css';

const preview: Preview = {
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'map',
      values: [
        { name: 'map', value: '#e7e3da' },
        { name: 'map-dark', value: '#1c1f24' },
        { name: 'app', value: 'hsl(40 20% 98%)' },
      ],
    },
    controls: { expanded: true },
    options: {
      storySort: {
        order: ['Map Lab', ['Markers', 'Rings', 'Zoom', 'Density', 'States']],
      },
    },
  },
};

export default preview;
