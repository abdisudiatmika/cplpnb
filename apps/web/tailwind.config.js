/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#1E50A0",
        "primary-container": "#DCE1FF",
        "on-primary": "#FFFFFF",
        "on-primary-container": "#001552",
        
        "secondary": "#0EA5E9",
        "secondary-container": "#BAEAFF",
        "on-secondary": "#FFFFFF",
        "on-secondary-container": "#001F2A",
        
        "background": "#F8FAFC",
        "on-background": "#1E293B",
        
        "surface": "#FFFFFF",
        "on-surface": "#1E293B",
        "surface-variant": "#F1F5F9",
        "on-surface-variant": "#64748B",
        
        "outline": "#E2E8F0",
        "outline-variant": "#CBD5E1",
        
        "error": "#EF4444",
        "error-container": "#FEE2E2",
        "on-error": "#FFFFFF",
        "on-error-container": "#7F1D1D",
        
        "success": "#10B981",
        "success-container": "#D1FAE5",
        "on-success": "#FFFFFF",
        "on-success-container": "#064E3B",
        
        "surface-dim": "#F1F5F9",
        "surface-bright": "#FFFFFF",
        "surface-container-lowest": "#FFFFFF",
        "surface-container-low": "#F8FAFC",
        "surface-container": "#F1F5F9",
        "surface-container-high": "#E2E8F0",
        "surface-container-highest": "#CBD5E1",
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      spacing: {
        "3xl": "56px",
        "unit": "4px",
        "sm": "8px",
        "2xl": "40px",
        "lg": "20px",
        "gutter": "20px",
        "xs": "4px",
        "xl": "28px",
        "md": "12px",
        "margin": "20px"
      },
      fontFamily: {
        "display-3xl-mobile": ["Inter", "sans-serif"],
        "body-base": ["Inter", "sans-serif"],
        "display-3xl": ["Inter", "sans-serif"],
        "headline-lg": ["Inter", "sans-serif"],
        "label-sm": ["Inter", "sans-serif"],
        "body-sm": ["Inter", "sans-serif"],
        "label-xs": ["Inter", "sans-serif"],
        "display-2xl": ["Inter", "sans-serif"],
        "headline-xl": ["Inter", "sans-serif"]
      },
      fontSize: {
        "display-3xl-mobile": ["20px", { "lineHeight": "28px", "fontWeight": "700" }],
        "body-base": ["14px", { "lineHeight": "20px", "fontWeight": "400" }],
        "display-3xl": ["24px", { "lineHeight": "32px", "letterSpacing": "-0.02em", "fontWeight": "700" }],
        "headline-lg": ["16px", { "lineHeight": "24px", "fontWeight": "600" }],
        "label-sm": ["13px", { "lineHeight": "18px", "fontWeight": "500" }],
        "body-sm": ["13px", { "lineHeight": "18px", "fontWeight": "400" }],
        "label-xs": ["11px", { "lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "600" }],
        "display-2xl": ["20px", { "lineHeight": "28px", "letterSpacing": "-0.01em", "fontWeight": "700" }],
        "headline-xl": ["18px", { "lineHeight": "26px", "fontWeight": "600" }]
      }
    },
  },
  plugins: [],
}
