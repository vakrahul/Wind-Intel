import React from 'react';

export function LoadingState({ message = 'Synchronizing official Elexon BMRS telemetry...' }) {
  return (
    <div
      className="editorial-panel pistachio-panel"
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="16"
            cy="16"
            r="12"
            stroke="#BFC9B9"
            strokeWidth="2.5"
          />
          <path
            d="M16 4A12 12 0 0 1 28 16"
            stroke="#1B5E3C"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 16 16"
              to="360 16 16"
              dur="1s"
              repeatCount="indefinite"
            />
          </path>
        </svg>
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: '1.05rem',
            }}
          >
            {message}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              marginTop: '0.2rem',
            }}
          >
            FUELHH (half-hourly actuals) + WINDFOR (historical forecast vintages)
          </div>
        </div>
      </div>
      <span className="badge badge-official">LIVE BACKEND QUERY</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div
      className="editorial-panel"
      role="alert"
      style={{
        borderColor: 'var(--border-crimson)',
        background: 'var(--bg-crimson-tint)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <span className="badge badge-under">API COMMUNICATION ERROR</span>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.15rem',
              marginTop: '0.5rem',
              color: 'var(--text-primary)',
            }}
          >
            Unable to complete analytical request
          </h3>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              color: 'var(--status-crimson)',
              marginTop: '0.25rem',
            }}
          >
            {error || 'Unexpected error communicating with backend service.'}
          </p>
        </div>
        {onRetry && (
          <button type="button" className="btn-primary" onClick={onRetry}>
            Retry Request
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  title = 'No eligible paired observations in selected window',
  detail = 'Adjust the date range or historical procurement cutoff to inspect available Elexon records.',
}) {
  return (
    <div className="editorial-panel" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
      <span className="badge badge-excluded">INSUFFICIENT SAMPLE / EMPTY WINDOW</span>
      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.2rem',
          marginTop: '0.65rem',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: '0.86rem',
          color: 'var(--text-secondary)',
          maxWidth: '52ch',
          margin: '0.4rem auto 0',
        }}
      >
        {detail}
      </p>
    </div>
  );
}
