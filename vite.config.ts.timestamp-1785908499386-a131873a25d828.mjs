// vite.config.ts
import { defineConfig } from "file:///C:/Users/B1G/Desktop/B1G%20Work/Sytem/OMS/B1G_Ordering_System_V2/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/B1G/Desktop/B1G%20Work/Sytem/OMS/B1G_Ordering_System_V2/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { componentTagger } from "file:///C:/Users/B1G/Desktop/B1G%20Work/Sytem/OMS/B1G_Ordering_System_V2/node_modules/lovable-tagger/dist/index.js";
import removeConsole from "file:///C:/Users/B1G/Desktop/B1G%20Work/Sytem/OMS/B1G_Ordering_System_V2/node_modules/vite-plugin-remove-console/dist/index.mjs";
var __vite_injected_original_dirname = "C:\\Users\\B1G\\Desktop\\B1G Work\\Sytem\\OMS\\B1G_Ordering_System_V2";
var vite_config_default = defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8081
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // Remove ALL console logs in production (including console.error)
    // Note: window.console in main.tsx will still work as it's not removed by the plugin
    mode === "production" && removeConsole()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxCMUdcXFxcRGVza3RvcFxcXFxCMUcgV29ya1xcXFxTeXRlbVxcXFxPTVNcXFxcQjFHX09yZGVyaW5nX1N5c3RlbV9WMlwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcQjFHXFxcXERlc2t0b3BcXFxcQjFHIFdvcmtcXFxcU3l0ZW1cXFxcT01TXFxcXEIxR19PcmRlcmluZ19TeXN0ZW1fVjJcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL0IxRy9EZXNrdG9wL0IxRyUyMFdvcmsvU3l0ZW0vT01TL0IxR19PcmRlcmluZ19TeXN0ZW1fVjIvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xyXG5pbXBvcnQgcmVhY3QgZnJvbSBcIkB2aXRlanMvcGx1Z2luLXJlYWN0LXN3Y1wiO1xyXG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xyXG5pbXBvcnQgeyBjb21wb25lbnRUYWdnZXIgfSBmcm9tIFwibG92YWJsZS10YWdnZXJcIjtcclxuaW1wb3J0IHJlbW92ZUNvbnNvbGUgZnJvbSBcInZpdGUtcGx1Z2luLXJlbW92ZS1jb25zb2xlXCI7XHJcblxyXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKHsgbW9kZSB9KSA9PiAoe1xyXG4gIHNlcnZlcjoge1xyXG4gICAgaG9zdDogXCI6OlwiLFxyXG4gICAgcG9ydDogODA4MSxcclxuICB9LFxyXG4gIHBsdWdpbnM6IFtcclxuICAgIHJlYWN0KCksXHJcbiAgICBtb2RlID09PSBcImRldmVsb3BtZW50XCIgJiYgY29tcG9uZW50VGFnZ2VyKCksXHJcbiAgICAvLyBSZW1vdmUgQUxMIGNvbnNvbGUgbG9ncyBpbiBwcm9kdWN0aW9uIChpbmNsdWRpbmcgY29uc29sZS5lcnJvcilcclxuICAgIC8vIE5vdGU6IHdpbmRvdy5jb25zb2xlIGluIG1haW4udHN4IHdpbGwgc3RpbGwgd29yayBhcyBpdCdzIG5vdCByZW1vdmVkIGJ5IHRoZSBwbHVnaW5cclxuICAgIG1vZGUgPT09IFwicHJvZHVjdGlvblwiICYmIHJlbW92ZUNvbnNvbGUoKSxcclxuICBdLmZpbHRlcihCb29sZWFuKSxcclxuICByZXNvbHZlOiB7XHJcbiAgICBhbGlhczoge1xyXG4gICAgICBcIkBcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuL3NyY1wiKSxcclxuICAgIH0sXHJcbiAgfSxcclxufSkpO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQThYLFNBQVMsb0JBQW9CO0FBQzNaLE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFDakIsU0FBUyx1QkFBdUI7QUFDaEMsT0FBTyxtQkFBbUI7QUFKMUIsSUFBTSxtQ0FBbUM7QUFPekMsSUFBTyxzQkFBUSxhQUFhLENBQUMsRUFBRSxLQUFLLE9BQU87QUFBQSxFQUN6QyxRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixNQUFNO0FBQUEsRUFDUjtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ04sU0FBUyxpQkFBaUIsZ0JBQWdCO0FBQUE7QUFBQTtBQUFBLElBRzFDLFNBQVMsZ0JBQWdCLGNBQWM7QUFBQSxFQUN6QyxFQUFFLE9BQU8sT0FBTztBQUFBLEVBQ2hCLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLEtBQUssS0FBSyxRQUFRLGtDQUFXLE9BQU87QUFBQSxJQUN0QztBQUFBLEVBQ0Y7QUFDRixFQUFFOyIsCiAgIm5hbWVzIjogW10KfQo=
