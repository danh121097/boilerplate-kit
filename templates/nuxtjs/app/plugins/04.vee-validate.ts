import { Form, Field, ErrorMessage } from "vee-validate";

/**
 * Register the bare vee-validate components globally so any page can use
 * <Form> / <Field> / <ErrorMessage> without per-file imports. Our `VeeInput`
 * component wraps `useField` directly — these globals are for the rare case
 * where you need vee-validate's slot scopes.
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.component("VeeForm", Form);
  nuxtApp.vueApp.component("VeeField", Field);
  nuxtApp.vueApp.component("VeeError", ErrorMessage);
});
