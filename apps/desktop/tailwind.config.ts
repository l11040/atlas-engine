import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "var(--radius-xs)"
      },
      fontSize: {
        "2xs": "var(--font-size-2xs)",
        xs: "var(--font-size-xs)",
        sm: "var(--font-size-sm)",
        base: "var(--font-size-md)",
        lg: "var(--font-size-lg)",
        xl: "var(--font-size-xl)",
        "2xl": "var(--font-size-2xl)"
      },
      fontWeight: {
        medium: "var(--font-weight-medium)",
        semibold: "var(--font-weight-semibold)",
        bold: "var(--font-weight-bold)"
      },
      letterSpacing: {
        tight: "var(--letter-spacing-tight)",
        normal: "var(--letter-spacing-normal)"
      },
      boxShadow: {
        sm: "var(--shadow-sm)"
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        surface: {
          base: "var(--color-surface-base)",
          subtle: "var(--color-surface-subtle)"
        },
        text: {
          strong: "var(--color-text-strong)",
          muted: "var(--color-text-muted)"
        },
        status: {
          info: "var(--color-status-info)",
          success: "var(--color-status-success)",
          warning: "var(--color-status-warning)",
          danger: "var(--color-status-danger)"
        },
        diff: {
          "addition-bg": "var(--color-diff-addition-bg)",
          "addition-text": "var(--color-diff-addition-text)",
          "modified-bg": "var(--color-diff-modified-bg)",
          "modified-text": "var(--color-diff-modified-text)",
          "deletion-bg": "var(--color-diff-deletion-bg)",
          "deletion-text": "var(--color-diff-deletion-text)",
          "hunk-bg": "var(--color-diff-hunk-bg)",
          "hunk-text": "var(--color-diff-hunk-text)",
          "line-number": "var(--color-diff-line-number)"
        },
        tool: {
          read: "var(--color-tool-read)",
          write: "var(--color-tool-write)",
          edit: "var(--color-tool-edit)",
          bash: "var(--color-tool-bash)",
          search: "var(--color-tool-search)",
          default: "var(--color-tool-default)"
        },
        "border-subtle": "var(--color-border-subtle)",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        border: "hsl(var(--border))"
      }
    }
  },
  plugins: [typography]
} satisfies Config;
