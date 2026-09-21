import { useEffect, useRef, useState } from 'react';
import { searchPlaces, getPlaceDetails } from './api.js';

export default function PlaceInput({ label, value, onSelect, biasCoords }) {
  const [query, setQuery] = useState(value?.name ?? '');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const inputRef = useRef(null);

  // Sync display when parent resets via key prop
  useEffect(() => {
    setQuery(value?.name ?? '');
    setSuggestions([]);
    setOpen(false);
  }, [value]);

  function handleChange(e) {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);

    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const data = await searchPlaces(q, biasCoords ?? {}, ctrl.signal);
        setSuggestions(data.predictions ?? []);
        setOpen(true);
      } catch (err) {
        if (err.name !== 'AbortError') setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 280);
  }

  async function handleSelect(pred) {
    setOpen(false);
    setSuggestions([]);
    setQuery(pred.name || pred.address || '');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const details = await getPlaceDetails(pred.placeId, ctrl.signal);
      onSelect(details);
    } catch {
      // silently ignore — user can retry
    }
  }

  function handleBlur() {
    // Delay so click on suggestion fires first
    setTimeout(() => setOpen(false), 150);
  }

  return (
    <div className="place-input-wrap">
      <label className="place-label">{label}</label>
      <div className="place-input-row">
        <input
          ref={inputRef}
          className={`place-input${value ? ' place-input--has-value' : ''}`}
          type="text"
          value={query}
          placeholder={`Search ${label.toLowerCase()}…`}
          onChange={handleChange}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={handleBlur}
          autoComplete="off"
          spellCheck={false}
        />
        {loading && <span className="place-spinner" aria-hidden="true" />}
        {value && (
          <button
            className="place-clear"
            aria-label={`Clear ${label}`}
            onClick={() => {
              setQuery('');
              setSuggestions([]);
              setOpen(false);
              onSelect(null);
              inputRef.current?.focus();
            }}
          >
            ×
          </button>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <ul className="place-dropdown" role="listbox">
          {suggestions.map((pred) => (
            <li
              key={pred.placeId}
              role="option"
              className="place-option"
              onMouseDown={() => handleSelect(pred)}
            >
              <span className="place-option-main">{pred.name}</span>
              {pred.address && (
                <span className="place-option-sub">{pred.address}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
