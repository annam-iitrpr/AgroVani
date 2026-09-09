'use client'

import { MapContainer, TileLayer, LayersControl, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const { BaseLayer, Overlay } = LayersControl
const farmIcon = L.divIcon({ className: 'fv-pin', html: '<div style="width:18px;height:18px;border:4px solid white;border-radius:50%;background:#006a42;box-shadow:0 2px 8px #17221d"></div>', iconSize: [18, 18], iconAnchor: [9, 9] })

export default function WeatherLeaflet({ lat = 22.5, lon = 79 }) {
  const center = [Number(lat) || 22.5, Number(lon) || 79]
  return (
    <MapContainer center={[22.5, 79]} zoom={5} minZoom={4} maxZoom={10} scrollWheelZoom style={{ height: 390, width: '100%' }}>
      <LayersControl position="topright">
        <BaseLayer checked name="Local weather · IMD / station">
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        </BaseLayer>
        <BaseLayer name="Indian satellite · INSAT / MOSDAC">
          <TileLayer attribution="NASA GIBS satellite preview; connect MOSDAC for production" url="https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/2024-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg" opacity={0.82} />
        </BaseLayer>
        <BaseLayer name="World forecast · NOAA / GFS">
          <TileLayer attribution="NOAA/GFS adapter preview" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" opacity={0.65} />
        </BaseLayer>
        <Overlay checked name="Your farm">
          <Marker position={center} icon={farmIcon}><Popup>Your selected farm</Popup></Marker>
        </Overlay>
      </LayersControl>
    </MapContainer>
  )
}