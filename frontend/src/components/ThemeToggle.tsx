interface ThemeToggleProps {
  theme: 'light' | 'dark';
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <button
      type="button"
      className="btn btn-outline"
      onClick={onToggle}
      aria-label="Toggle theme"
      style={{ minWidth: 96 }}
    >
      {theme === 'light' ? 'Dark mode' : 'Light mode'}
    </button>
  );
}

