/** Flor da Coreto em traço (vetor), para fundos grandes sem perder nitidez. */
export function FlorLinhas({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M126.8 35.3A28 28 0 0 1 164.7 73.2A28 28 0 0 1 164.7 126.8A28 28 0 0 1 126.8 164.7A28 28 0 0 1 73.2 164.7A28 28 0 0 1 35.3 126.8A28 28 0 0 1 35.3 73.2A28 28 0 0 1 73.2 35.3A28 28 0 0 1 126.8 35.3Z" />
      <path d="M100.0 62.0A15 15 0 0 1 126.9 73.1A15 15 0 0 1 138.0 100.0A15 15 0 0 1 126.9 126.9A15 15 0 0 1 100.0 138.0A15 15 0 0 1 73.1 126.9A15 15 0 0 1 62.0 100.0A15 15 0 0 1 73.1 73.1A15 15 0 0 1 100.0 62.0Z" />
      <path d="M100.0 89.0L100.0 62.0M107.8 92.2L126.9 73.1M111.0 100.0L138.0 100.0M107.8 107.8L126.9 126.9M100.0 111.0L100.0 138.0M92.2 107.8L73.1 126.9M89.0 100.0L62.0 100.0M92.2 92.2L73.1 73.1" opacity="0.6" />
      <circle cx="100" cy="100" r="11" />
    </svg>
  );
}
