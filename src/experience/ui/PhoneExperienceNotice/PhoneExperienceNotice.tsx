import "./PhoneExperienceNotice.css";

export default function PhoneExperienceNotice() {
  return (
    <div className="phoneExperienceNotice" role="status" aria-live="polite">
      <span className="phoneExperienceNotice__icon" aria-hidden="true">
        ⚠
      </span>
      <span>This experience is better on a laptop.</span>
    </div>
  );
}
