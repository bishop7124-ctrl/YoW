import { StudioSheet } from '../presentation/Studio'

// The Fix: uses theme variables so all 4 themes apply correctly
export default function Modal({ title, onClose, children, wide = false, centered = true, closeOnBackdrop = true }) {
  return (
    <StudioSheet title={title} onClose={onClose} narrow={!wide} centered={centered} closeOnBackdrop={closeOnBackdrop}>
      {children}
    </StudioSheet>
  )
}
