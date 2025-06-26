import React, { useEffect, useState, useRef } from 'react';
import Plot from 'react-plotly.js';
import axios from 'axios';

// Euclidean distance in 3D
function euclideanDist(a, b) {
  return Math.sqrt(
    Math.pow(a.x - b.x, 2) +
    Math.pow(a.y - b.y, 2) +
    Math.pow(a.z - b.z, 2)
  );
}

function App() {
  const [chunks, setChunks] = useState([]);
  const [selectedChunk, setSelectedChunk] = useState(null);
  const [visibleSources, setVisibleSources] = useState([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showFullChunk, setShowFullChunk] = useState(false);
  const [neighborCount, setNeighborCount] = useState(0);
  const [neighborChunks, setNeighborChunks] = useState(null); // null means "not in neighbor mode"
  const popupRef = useRef();
  const plotRef = useRef();

  // Load all chunk data
  useEffect(() => {
    axios.get('http://127.0.0.1:8000/chunks')
      .then(response => {
        setChunks(response.data.chunks);
        const allSources = [...new Set(response.data.chunks.map(c => c.source))];
        setVisibleSources(allSources);
      })
      .catch(error => console.error(error));
  }, []);

  const sources = [...new Set(chunks.map(c => c.source))];
  // Pastel/soft color palette to match inspiration
  const colors = [
    '#85d8ce', '#a7c7e7', '#e6aace', '#b1e693', '#ffe7a3', '#f7b267', '#c1b2e6', '#f4b5c2'
  ];

  // Compute search results
  useEffect(() => {
    if (search.trim()) {
      const matches = chunks.filter(c =>
        c.chunk.toLowerCase().includes(search.toLowerCase()) &&
        visibleSources.includes(c.source)
      );
      setSearchResults(matches);
    } else {
      setSearchResults([]);
    }
  }, [search, chunks, visibleSources]);

  // Visible chunks logic (neighbor filter > search > all)
  let visibleChunks;
  if (neighborChunks) {
    visibleChunks = neighborChunks;
  } else if (search.trim()) {
    visibleChunks = chunks.filter(c =>
      c.chunk.toLowerCase().includes(search.toLowerCase()) &&
      visibleSources.includes(c.source)
    );
  } else {
    visibleChunks = chunks.filter(c => visibleSources.includes(c.source));
  }

  const plotSources = [...new Set(visibleChunks.map(c => c.source))];
  const data = plotSources.map((src, i) => ({
    x: visibleChunks.filter(c => c.source === src).map(c => c.x),
    y: visibleChunks.filter(c => c.source === src).map(c => c.y),
    z: visibleChunks.filter(c => c.source === src).map(c => c.z),
    text: visibleChunks.filter(c => c.source === src).map(c => c.chunk),
    type: 'scatter3d',
    mode: 'markers',
    name: src,
    marker: { color: colors[i % colors.length], size: 3, opacity: 0.75, line: { width: 0 } },
    hovertemplate: '%{text}<extra></extra>',
  }));

  // Closest X neighbors logic (returns [clicked, ...nearest])
  function findNearestNeighbors(clickedChunk, n) {
    if (!clickedChunk || n < 1) return [clickedChunk];
    const baseSet = chunks.filter(c => visibleSources.includes(c.source));
    const valid = baseSet.filter(c =>
      typeof c.x === "number" && typeof c.y === "number" && typeof c.z === "number"
    );
    const match = valid.find(c => c.chunk === clickedChunk.chunk && c.source === clickedChunk.source);
    if (!match) return [clickedChunk];
    const sorted = valid
      .filter(c => c !== match)
      .map(c => ({ ...c, dist: euclideanDist(match, c) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, n);
    return [match, ...sorted];
  }

  function handleNeighborInputChange(e) {
    setNeighborCount(Math.max(0, parseInt(e.target.value || "0", 10)));
  }

  function handleChunkSelect(chunk) {
    setSelectedChunk({ text: chunk.chunk, source: chunk.source });
    setShowFullChunk(false);
    if (neighborCount > 0) {
      setNeighborChunks(findNearestNeighbors(chunk, neighborCount));
    }
  }

  function handleClearNeighbors() {
    setNeighborChunks(null);
  }

  // Popup: get chunk number/total for current book/source
  function getChunkPopupInfo(selected) {
    if (!selected) return { chunkNum: null, total: null };
    const chunksInSource = chunks.filter(c => c.source === selected.source);
    const chunkNum = chunksInSource.findIndex(c => c.chunk === selected.text) + 1;
    const total = chunksInSource.length;
    return { chunkNum, total };
  }

  // Persistent popup handling
  useEffect(() => {
    function handler(e) {
      if (e.key === "Escape") setSelectedChunk(null);
      if (
        selectedChunk &&
        popupRef.current &&
        !popupRef.current.contains(e.target)
      ) setSelectedChunk(null);
    }
    document.addEventListener('keydown', handler);
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      document.removeEventListener('mousedown', handler);
    };
  }, [selectedChunk]);

  // Enter to select first search match
  useEffect(() => {
    function handler(e) {
      if (e.key === "Enter" && searchResults.length > 0) {
        setSelectedChunk({ text: searchResults[0].chunk, source: searchResults[0].source });
        setShowFullChunk(false);
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [searchResults, search]);

  // Download visible data as CSV
  function downloadVisibleCSV() {
    const fields = ["source", "x", "y", "z", "chunk"];
    const csv =
      [fields.join(",")]
        .concat(
          visibleChunks.map(c =>
            fields.map(f => JSON.stringify(c[f] ?? "")).join(",")
          )
        )
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "textscape_visible_chunks.csv";
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(link);
    }, 200);
  }

  // Chapter markers (optional, soft golden color)
  const chapterMarkers = visibleChunks
    .filter(c => c.chunk.startsWith('CHAPTER') || c.chunk.startsWith('Chapter'))
    .map(c => ({
      x: c.x, y: c.y, z: c.z, text: c.chunk, source: c.source
    }));

  // MAIN RENDER:
  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: '#f7f8fa',
      fontFamily: 'Inter, Helvetica, Arial, sans-serif',
    }}>
      {/* Sidebar */}
      <aside style={{
        width: 320,
        background: '#fff',
        borderRadius: 24,
        margin: 24,
        marginRight: 0,
        padding: '32px 28px',
        boxShadow: '0 4px 32px 0 #e3e7ee33',
        display: 'flex',
        flexDirection: 'column',
        gap: 30,
        height: 'fit-content',
        minHeight: 580
      }}>
        <h2 style={{
          fontWeight: 700,
          fontSize: 28,
          marginBottom: 20,
          letterSpacing: '0.01em',
          color: '#222'
        }}>Filters</h2>
        {/* Search input */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search text..."
          style={{
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            border: '1px solid #e5e8ec',
            borderRadius: 12,
            padding: '12px 15px',
            fontSize: 17,
            background: '#f7f8fa',
            outline: 'none',
            marginBottom: 16
          }}
        />
        {/* Search results quick access */}
        {search.trim() && searchResults.length > 0 && (
          <div style={{
            background: "#f7f8fa",
            border: '1px solid #e5e8ec',
            borderRadius: 12,
            padding: '12px 10px',
            marginBottom: 10,
            maxHeight: 120,
            overflowY: 'auto'
          }}>
            <div style={{ fontWeight: 600, color: "#444", marginBottom: 4 }}>Results</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {searchResults.slice(0, 6).map((c, i) => (
                <li key={i} style={{ marginBottom: 3 }}>
                  <span style={{ fontWeight: 500, fontSize: 15 }}>{c.source}: </span>
                  <span
                    onClick={() => handleChunkSelect(c)}
                    style={{ textDecoration: 'underline', color: '#6ab6a7', cursor: 'pointer' }}
                  >
                    {c.chunk.length > 50 ? c.chunk.slice(0, 50) + "…" : c.chunk}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* Book/source filter */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 7, fontSize: 17 }}>Category</div>
          <select
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '11px 36px 11px 10px', // more right padding for arrow
              borderRadius: 10,
              border: '1px solid #e5e8ec',
              fontSize: 16,
              background: "#f9f9fc",
              appearance: 'none',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              backgroundImage:
                "url('data:image/svg+xml;utf8,<svg fill=\"%23999\" height=\"18\" viewBox=\"0 0 24 24\" width=\"18\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M7 10l5 5 5-5z\"/></svg>')",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 13px center'
            }}
            value={visibleSources.length === 1 ? visibleSources[0] : 'All'}
            onChange={e => {
              if (e.target.value === 'All') setVisibleSources([...sources]);
              else setVisibleSources([e.target.value]);
            }}
          >
            <option value="All">All</option>
            {sources.map(src => (
              <option key={src} value={src}>{src}</option>
            ))}
          </select>
        </div>
        {/* Nearest neighbor filter */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 7, fontSize: 17 }}>Neighbors</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="number"
              min="0"
              value={neighborCount}
              style={{
                width: 60,
                borderRadius: 8,
                border: '1px solid #e5e8ec',
                padding: '6px 10px',
                fontSize: 16,
                background: "#f7f8fa"
              }}
              onChange={handleNeighborInputChange}
            />
            <span style={{ fontSize: 15 }}>nearest neighbors</span>
          </div>
          {neighborChunks &&
            <button
              style={{
                marginTop: 10,
                padding: '7px 12px',
                borderRadius: 10,
                border: 'none',
                background: '#d7ebe7',
                color: '#32685e',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              onClick={handleClearNeighbors}
            >Clear neighbor filter</button>
          }
        </div>
        {/* Download */}
        <button
          onClick={downloadVisibleCSV}
          style={{
            marginTop: 'auto',
            background: '#b9e9da',
            color: '#222',
            border: '1.5px solid #5db89a',
            borderRadius: 14,
            fontWeight: 700,
            fontSize: 18,
            padding: '13px 0',
            cursor: 'pointer'
          }}
        >Download Visible Data (CSV)</button>
        {/* Reset */}
        <button
          onClick={() => {
            setVisibleSources([...sources]);
            setSearch('');
            setNeighborChunks(null);
            setNeighborCount(0);
          }}
          style={{
            marginTop: 8,
            background: '#f1f3f5',
            color: '#23242c',
            border: 'none',
            borderRadius: 14,
            fontWeight: 700,
            fontSize: 17,
            padding: '12px 0',
            cursor: 'pointer'
          }}
        >Reset</button>
      </aside>
      {/* Main content/plot area */}
      <main style={{
        flex: 1,
        padding: '56px 50px 0 50px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh'
      }}>
        <h1 style={{ fontWeight: 700, fontSize: 36, marginBottom: 28, letterSpacing: '0.01em', color: '#23242c' }}>
          3D Scatter Plot
        </h1>
        <div style={{
          background: '#fff',
          borderRadius: 32,
          padding: 36,
          boxShadow: '0 4px 32px 0 #e3e7ee33'
        }}>
          <Plot
            ref={plotRef}
            data={data}
            layout={{
              width: 900,
              height: 600,
              margin: { l: 0, r: 0, b: 0, t: 0 },
              scene: {
                xaxis: { title: 'X Axis', gridcolor: '#f2f3f8', zerolinecolor: '#d3d3df', showbackground: false, tickfont: { size: 14 } },
                yaxis: { title: 'Y Axis', gridcolor: '#f2f3f8', zerolinecolor: '#d3d3df', showbackground: false, tickfont: { size: 14 } },
                zaxis: { title: 'Z Axis', gridcolor: '#f2f3f8', zerolinecolor: '#d3d3df', showbackground: false, tickfont: { size: 14 } }
              },
              paper_bgcolor: "#fff",
              plot_bgcolor: "#fff",
              font: { family: 'Inter, sans-serif', color: '#23242c', size: 16 },
              showlegend: false,
              shapes: chapterMarkers.map((m, i) => ({
                type: 'circle',
                xref: 'x',
                yref: 'y',
                xsizemode: 'pixel',
                ysizemode: 'pixel',
                x0: m.x - 0.25,
                y0: m.y - 0.25,
                x1: m.x + 0.25,
                y1: m.y + 0.25,
                line: { color: '#ffe492', width: 2 },
                fillcolor: '#ffe492',
                opacity: 0.3
              }))
            }}
            config={{ displayModeBar: false }}
            onClick={event => {
              const point = event.points[0];
              if (point) {
                handleChunkSelect({
                  chunk: point.data.text[point.pointNumber],
                  source: point.data.name
                });
              }
            }}
          />
        </div>
      </main>
      {/* Popup/modal for chunk details */}
      {selectedChunk && (() => {
        const { chunkNum, total } = getChunkPopupInfo(selectedChunk);
        const text = selectedChunk.text;
        const isLong = text.length > 300;
        return (
          <div
            ref={popupRef}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%,-50%)',
              background: '#fff',
              border: '2px solid #eee',
              zIndex: 10000,
              maxWidth: '700px',
              width: '90vw',
              padding: '2em 2em 1.2em 2em',
              boxShadow: '0 10px 40px 0 #b0bed733',
              borderRadius: 24
            }}>
            <button
              style={{
                position: 'absolute',
                right: 18, top: 12, fontSize: '1.3em',
                border: 'none', background: 'transparent', cursor: 'pointer', color: '#7e8895'
              }}
              onClick={() => setSelectedChunk(null)}
              title="Close (Esc or click outside)"
            >✖</button>
            <div style={{ marginBottom: 18 }}>
              <strong>
                {chunkNum && total
                  ? `Chunk ${chunkNum} of ${total} in ${selectedChunk.source}`
                  : `Source: ${selectedChunk.source}`}
              </strong>
            </div>
            <strong style={{ display: 'block', marginBottom: 6 }}>Chunk text:</strong>
            <div style={{ marginBottom: '0.5em', whiteSpace: 'pre-wrap', fontSize: 17, color: "#23242c" }}>
              {showFullChunk || !isLong
                ? text
                : <>
                    {text.slice(0, 300)}...
                    <button
                      style={{ marginLeft: '1em', color: '#6ab6a7', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
                      onClick={() => setShowFullChunk(true)}
                    >
                      Show more
                    </button>
                  </>
              }
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default App;
