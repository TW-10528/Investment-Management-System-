export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: 'class',   // Toggle dark mode via <html class="dark">
  theme: {
    extend: {
      colors: {
        primary: { 50:"#eff6ff", 100:"#dbeafe", 500:"#3b82f6",
                   600:"#2563eb", 700:"#1d4ed8", 900:"#1e3a5f" },
        success: { 100:"#dcfce7", 600:"#16a34a" },
        warning: { 100:"#fef9c3", 600:"#ca8a04" },
        danger:  { 100:"#fee2e2", 600:"#dc2626" },
        // Dark mode grays
        gray: {
          750: '#2d3748',
          850: '#1a202c',
          950: '#0d1117',
        }
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      transitionProperty: {
        'colors': 'color, background-color, border-color, fill, stroke',
      },
    }
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/typography")
  ]
}
