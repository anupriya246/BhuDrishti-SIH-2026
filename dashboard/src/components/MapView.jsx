/**
 * MapView — Leaflet map showing NER districts as colour-coded circle markers.
 * Clicking a marker shows a popup with risk details.
 * Uses react-leaflet v4.
 */
import React from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, ZoomControl } from 'react-leaflet'

// NER bounding box centre
const NER_CENTER = [25.5, 92.5]
const ZOOM = 6

const RISK_COLORS = {
  Low:      '#2ecc71',
  Moderate: '#f39c12',
  High:     '#e74c3c',
  Critical: '#8e44ad',
}

const RISK_RADIUS = {
  Low:      10,
  Moderate: 13,
  High:     16,
  Critical: 20,
}

export default function MapView({ regions, onSelectRegion }) {
  return (
    <div className="card map-card">
      <h2 className="card__title">
        <span aria-hidden="true">🗺️</span> NER Landslide Risk Map
      </h2>
      <div className="map-wrapper">
        <MapContainer
          center={NER_CENTER}
          zoom={ZOOM}
          style={{ height: '100%', width: '100%', borderRadius: '8px' }}
          zoomControl={false}
          aria-label="North-East India landslide risk map"
        >
          <ZoomControl position="bottomright" />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {(regions || []).map((region) => {
            const color  = RISK_COLORS[region.risk_category] || '#aaa'
            const radius = RISK_RADIUS[region.risk_category] || 10

            return (
              <CircleMarker
                key={region.name}
                center={[region.lat, region.lon]}
                radius={radius}
                pathOptions={{
                  fillColor:   color,
                  fillOpacity: 0.85,
                  color:       '#fff',
                  weight:      2,
                }}
                eventHandlers={{
                  click: () => onSelectRegion && onSelectRegion(region),
                }}
                aria-label={`${region.name}: ${region.risk_category} risk`}
              >
                <Popup>
                  <div className="map-popup">
                    <strong>{region.name}</strong>
                    <div
                      className="map-popup__badge"
                      style={{ background: color }}
                    >
                      {region.risk_category}
                    </div>
                    <table className="map-popup__table">
                      <tbody>
                        <tr><td>Rainfall</td><td>{region.rainfall_mm} mm</td></tr>
                        <tr><td>Avg Slope</td><td>{region.slope_avg}°</td></tr>
                        <tr><td>Lat / Lon</td><td>{region.lat.toFixed(2)}, {region.lon.toFixed(2)}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="map-legend" role="list" aria-label="Risk level legend">
        {Object.entries(RISK_COLORS).map(([label, color]) => (
          <div key={label} className="map-legend__item" role="listitem">
            <span
              className="map-legend__dot"
              style={{ background: color }}
              aria-hidden="true"
            />
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}
