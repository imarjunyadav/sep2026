import { useEffect, useReducer, useRef } from 'react';
import SearchPanel from './SearchPanel.jsx';
import ResultsPanel from './ResultsPanel.jsx';
import JourneyDetail from './JourneyDetail.jsx';
import { findRoutes } from './api.js';

const INITIAL_STATE = {
  screen: 'search',
  origin: null,
  destination: null,
  journeys: [],
  warnings: [],
  routesError: null,
  selectedJourney: null,
  requestedAt: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SEARCH_START':
      return {
        ...state,
        screen: 'results',
        origin: action.origin,
        destination: action.destination,
        journeys: [],
        warnings: [],
        routesError: null,
        selectedJourney: null,
        loading: true,
      };
    case 'SEARCH_OK':
      return { ...state, loading: false, journeys: action.journeys, warnings: action.warnings, requestedAt: action.requestedAt };
    case 'SEARCH_ERR':
      return { ...state, loading: false, routesError: action.error };
    case 'SELECT_JOURNEY':
      return { ...state, screen: 'detail', selectedJourney: action.journey };
    case 'BACK_TO_SEARCH':
      return { ...state, screen: 'search' };
    case 'BACK_TO_RESULTS':
      return { ...state, screen: 'results', selectedJourney: null };
    default:
      return state;
  }
}

function pushHistory(screen) {
  const url = screen === 'search' ? '/' : `/?screen=${screen}`;
  history.pushState({ screen }, '', url);
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const abortRef = useRef(null);

  // Android back-button / browser back
  useEffect(() => {
    function onPop(e) {
      const screen = e.state?.screen ?? 'search';
      if (screen === 'search') dispatch({ type: 'BACK_TO_SEARCH' });
      else if (screen === 'results') dispatch({ type: 'BACK_TO_RESULTS' });
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  async function handleSearch(origin, destination, departureTime) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    dispatch({ type: 'SEARCH_START', origin, destination });
    pushHistory('results');

    try {
      const data = await findRoutes(origin, destination, departureTime, ctrl.signal);
      dispatch({ type: 'SEARCH_OK', journeys: data.journeys ?? [], warnings: data.warnings ?? [], requestedAt: data.requestedAt ?? null });
    } catch (err) {
      if (err.name !== 'AbortError') {
        dispatch({ type: 'SEARCH_ERR', error: err.message || 'Failed to fetch routes' });
      }
    }
  }

  function handleSelectJourney(journey) {
    dispatch({ type: 'SELECT_JOURNEY', journey });
    pushHistory('detail');
  }

  function handleBackToSearch() {
    dispatch({ type: 'BACK_TO_SEARCH' });
    pushHistory('search');
  }

  function handleBackToResults() {
    dispatch({ type: 'BACK_TO_RESULTS' });
    pushHistory('results');
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>CityOne</h1>
        <span className="app-header-tagline">Local · Metro · Bus · Walk</span>
      </header>

      <main className="app-main">
        {state.screen === 'search' && (
          <SearchPanel
            onSearch={handleSearch}
            initialOrigin={state.origin}
            initialDestination={state.destination}
          />
        )}

        {(state.screen === 'results' || state.screen === 'loading') && (
          <ResultsPanel
            journeys={state.journeys}
            warnings={state.warnings}
            error={state.routesError}
            loading={state.loading}
            onSelect={handleSelectJourney}
            onBack={handleBackToSearch}
          />
        )}

        {state.screen === 'detail' && state.selectedJourney && (
          <JourneyDetail
            journey={state.selectedJourney}
            requestedAt={state.requestedAt}
            onBack={handleBackToResults}
          />
        )}
      </main>
    </div>
  );
}
