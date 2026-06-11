export type InputType = "text" | "password" | "email" | "number" | "tel" | "search" | "url";
export type InputVariant = "default" | "filled";

/**
 * Shared prop surface for the base <Input> and the vee-validate wrapper <VeeInput>.
 *
 * <Input> adds: `modelValue` + `errorMessage` (caller controls them).
 * <VeeInput> adds: `name` (vee-validate field key) and reads value + errorMessage
 *                  from `useField` internally.
 */
export interface BaseInputProps {
  /** Label text — rendered as a floating label that lifts when focused or has value. */
  label?: string;
  /** Force the error border + colour. */
  error?: boolean;
  type?: InputType;
  /** Visual variant — `default` (outlined) | `filled` (subtle background). */
  variant?: InputVariant;
  readonly?: boolean;
  disabled?: boolean;
  /** Placeholder text (also used to determine if the floating label should lift). */
  placeholder?: string;
  autofocus?: boolean;
  maxlength?: number;
  /** Centre the input text + floating label. */
  center?: boolean;
  /** Show an `X` clear button when there is a value. */
  clearable?: boolean;
  /** `#` = digit, every other char literal. Pass an array of masks to pick the shortest that fits. */
  mask?: string | string[];
  /** Extra classes applied to the inner `<input>`. */
  inputClass?: string;
}
