/**
 * BhuDrishti — MapView
 * Light CartoDB tiles, earthy risk colours
 */
import React from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, ZoomControl } from 'react-leaflet'

const NER_CENTER = [25.5, 92.5]
const ZOOM = 6

const RISK_COLORS = {
  Low:      '#1a7a32',
  Moderate: '#b86000',
  High:     '#a02818',
  Critical: '#6020a8',
}

const RISK_RADIUS = {
  Low: 9, Moderate: 13, High: 17, Critical: 22,
}

export default function MapView({ regions, onSelectRegion }) {
  return (
    <div className="card map-card">
      <h2 className="card__title">
        <span aria-hidden="true">🗺️</span> NER Live Risk Map
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
            attribution='&copy; <a href="https://carto.com">CartoDB</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          {(regions || []).map((region) => {
            const color  = RISK_COLORS[region.risk_category] || '#888'
            const radius = RISK_RADIUS[region.risk_category] || 10
            return (
              <CircleMarker
                key={region.name}
                center={[region.lat, region.lon]}
                radius={radius}
                pathOptions={{ fillColor: color, fillOpacity: 0.88, color: '#fff', weight: 2 }}
                eventHandlers={{ click: () => onSelectRegion && onSelectRegion(region) }}
                aria-label={`${region.name}: ${region.risk_category} risk`}
              >
                <Popup>
                  <div className="map-popup">
                    <strong>{region.name}</strong>
                    <div className="map-popup__badge" style={{ background: color }}>
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
      <div className="map-legend" role="list" aria-label="Risk level legend">
        {Object.entries(RISK_COLORS).map(([label, color]) => (
          <div key={label} className="map-legend__item" role="listitem">
            <span className="map-legend__dot" style={{ background: color, color }} aria-hidden="true" />
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}
