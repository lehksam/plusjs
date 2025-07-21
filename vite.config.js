import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        minify: 'terser',
        terserOptions: {
            compress: {
                defaults: true
            }
        },
        rollupOptions: {
            input: {
                main: 'src/convert.js'
            }
        }
    }
});