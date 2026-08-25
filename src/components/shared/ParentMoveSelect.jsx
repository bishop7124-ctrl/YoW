// A native <select> for moving a record (scene/chapter/act, or any similar
// child) to a different parent — the control shows the item's *current*
// parent as its selected value, and picking a different option moves it
// there. Shared by src/components/outline/StoryOutline.jsx and
// src/components/Manuscript/StructureSidebar.jsx, which both need this
// exact interaction (StructureSidebar's own drag-and-drop can only target
// an empty parent; this can target any parent, populated or not) but style
// it differently — pass `className` for that, this component owns only the
// shared behavior.
export default function ParentMoveSelect({ value, options, label, onChange, className }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      onClick={e => e.stopPropagation()}
      title={label}
      aria-label={label}
      className={className}
    >
      {options.map(option => (
        <option key={option.id} value={option.id}>{option.label}</option>
      ))}
    </select>
  )
}
