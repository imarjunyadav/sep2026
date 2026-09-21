import JourneyCard from './JourneyCard.jsx';

const CATEGORY_LABELS = {
  LOCAL_TRAIN: 'Local Train',
  METRO:       'Metro',
  BUS:         'Bus',
  MULTIMODAL:  'Multimodal',
  WALK:        'Walking',
  BIKE:        'Cycling',
  CAR:         'Driving',
};

export default function ResultsPanel({ journeys, warnings, error, loading, onSelect, onBack }) {
  const showResults = !loading && !error && journeys.length > 0;

  return (
    <div className="results-panel">
      <div className="results-header">
        <button className="back-btn" onClick={onBack} type="button" aria-label="Back to search">
          ← Back
        </button>
        <h2 className="results-title">Routes</h2>
        {showResults && (
          <span className="results-count">{journeys.length} option{journeys.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {warnings && warnings.length > 0 && (
        <ul className="warning-list">
          {warnings.map((w, i) => <li key={i} className="warning-item">{w}</li>)}
        </ul>
      )}

      {loading && (
        <div className="loading-state">
          <div className="spinner" aria-label="Finding routes…" />
          <p className="muted">Finding routes…</p>
        </div>
      )}

      {!loading && error && (
        <div className="empty-state"><p className="error">{error}</p></div>
      )}

      {!loading && !error && journeys.length === 0 && (
        <div className="empty-state">
          <p className="muted">No routes found. Try adjusting your origin or destination.</p>
        </div>
      )}

      {showResults && (
        <ul className="journey-list">
          {journeys.map(j => (
            <li key={j.id} className="journey-section">
              <div className="journey-category-label">
                {CATEGORY_LABELS[j.category] ?? j.category}
              </div>
              <JourneyCard journey={j} onClick={() => onSelect(j)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
