type BaseProps = {
  name: string;
  label: string;
  defaultValue: string;
  error?: string | undefined;
};

function FieldError({ error }: { error?: string | undefined }) {
  return error ? <small className="field-error">{error}</small> : null;
}

export function TextField({
  name,
  label,
  defaultValue,
  error,
  placeholder,
}: BaseProps & { placeholder?: string | undefined }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
      />
      <FieldError error={error} />
    </label>
  );
}

export function NumberField({
  name,
  label,
  defaultValue,
  error,
  min,
  max,
  step,
}: BaseProps & { min?: number | undefined; max?: number | undefined; step?: number | undefined }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        min={min}
        max={max}
        step={step}
        aria-invalid={error ? true : undefined}
      />
      <FieldError error={error} />
    </label>
  );
}

export function SelectField({
  name,
  label,
  defaultValue,
  error,
  options,
}: BaseProps & { options: readonly { value: string; label: string }[] }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} defaultValue={defaultValue} aria-invalid={error ? true : undefined}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError error={error} />
    </label>
  );
}
