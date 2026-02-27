import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import clerk from '@clerk/astro';

export default defineConfig({
  output: 'server',
  adapter: netlify(),
  integrations: [
    clerk({
      signInUrl: '/sign-in',
      signUpUrl: '/sign-up'
    })
  ],
  vite: {
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev')
    }
  }
});
