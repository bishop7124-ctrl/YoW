export default function ManuscriptZoomControl({ pageZoom, onPageZoomChange }) {
  return (
    <div className="ms-page-zoom" role="group" aria-label="Manuscript page zoom">
      <button
        type="button"
        onClick={() => onPageZoomChange(pageZoom - 0.1)}
        disabled={pageZoom <= 0.8}
        aria-label="Zoom manuscript page out"
      >−</button>
      <span aria-live="polite">{Math.round(pageZoom * 100)}%</span>
      <button
        type="button"
        onClick={() => onPageZoomChange(pageZoom + 0.1)}
        disabled={pageZoom >= 1.5}
        aria-label="Zoom manuscript page in"
      >+</button>
    </div>
  )
}
