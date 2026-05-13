// @ts-check
import { defineConfig, fontProviders } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import cloudflare from '@astrojs/cloudflare'

export default defineConfig({
  site: 'https://calparella.site',
  output: 'server',
  adapter: cloudflare({
    imageService: 'cloudflare-binding',
    sessionKVBindingName: 'SESSION',
  }),
  vite: {
    plugins: [
      tailwindcss(),
      {
        name: '@astrojs/ts-plugin',
      },
    ],
  },
  build: {
    inlineStylesheets: 'always',
  },

  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },

  fonts: [
    {
      provider: fontProviders.local(),
      name: 'DynaPuff',
      cssVariable: '--font-dyna',
      options: {
        variants: [
          {
            src: ['./src/assets/fonts/dynapuff-regular.woff2'],
            weight: 'normal',
            style: 'normal',
          },
          {
            src: ['./src/assets/fonts/dynapuff-700.woff2'],
            weight: '700',
            style: 'normal',
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'CherryBombOne',
      cssVariable: '--font-cherry',
      options: {
        variants: [
          {
            src: ['./src/assets/fonts/cherry-bomb-one.woff2'],
            weight: 'normal',
            style: 'normal',
          },
        ],
      },
    },

    {
      provider: fontProviders.local(),
      name: 'EmilysCandy',
      cssVariable: '--font-emilys',
      options: {
        variants: [
          {
            src: ['./src/assets/fonts/emilys-candy.woff2'],
            weight: 'normal',
            style: 'normal',
          },
        ],
      },
    },
  ],
})
