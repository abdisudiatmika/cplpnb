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
        
        "background": "#F8F9FA",
        "on-background": "#344767",
        
        "surface": "#FFFFFF",
        "on-surface": "#344767",
        "surface-variant": "#F1F5F9",
        "on-surface-variant": "#67748E",
        
        "outline": "#E9ECEF",
        "outline-variant": "#D2D6DA",
        
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
        "surface-container-low": "#F8F9FA",
        "surface-container": "#F1F5F9",
        "surface-container-high": "#E2E8F0",
        "surface-container-highest": "#CBD5E1",
        "tertiary": "#8B5CF6",
        "surface-tint": "#F59E0B",
        "warning": "#F59E0B",
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "1rem",
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
        "display-3xl-mobile": ["Roboto", "Helvetica", "Arial", "sans-serif"],
        "body-base": ["Roboto", "Helvetica", "Arial", "sans-serif"],
        "display-3xl": ["Roboto", "Helvetica", "Arial", "sans-serif"],
        "headline-lg": ["Roboto", "Helvetica", "Arial", "sans-serif"],
        "label-sm": ["Roboto", "Helvetica", "Arial", "sans-serif"],
        "body-sm": ["Roboto", "Helvetica", "Arial", "sans-serif"],
        "label-xs": ["Roboto", "Helvetica", "Arial", "sans-serif"],
        "display-2xl": ["Roboto", "Helvetica", "Arial", "sans-serif"],
        "headline-xl": ["Roboto", "Helvetica", "Arial", "sans-serif"]
      },
      fontSize: {
        "display-3xl-mobile": ["20px", { "lineHeight": "28px", "fontWeight": "700" }],
        "body-base": ["14px", { "lineHeight": "20px", "fontWeight": "400" }],
        "display-3xl": ["24px", { "lineHeight": "32px", "letterSpacing": "0", "fontWeight": "700" }],
        "headline-lg": ["16px", { "lineHeight": "24px", "fontWeight": "500" }],
        "label-sm": ["13px", { "lineHeight": "18px", "fontWeight": "500" }],
        "body-sm": ["13px", { "lineHeight": "18px", "fontWeight": "400" }],
        "label-xs": ["11px", { "lineHeight": "16px", "letterSpacing": "0", "fontWeight": "500" }],
        "display-2xl": ["20px", { "lineHeight": "28px", "letterSpacing": "0", "fontWeight": "700" }],
        "headline-xl": ["18px", { "lineHeight": "26px", "fontWeight": "500" }]
      }
    },
  },
  plugins: [],
}
