export default {
  base: './',
  server: {
    port: 5173,
    strictPort: true
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok']
  }
};
